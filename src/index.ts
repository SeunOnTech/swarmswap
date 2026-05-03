import * as dotenv from 'dotenv';
import { Address } from 'viem';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { BlockchainService } from './services/blockchain.service';
import { StorageService } from './services/storage.service';
import { LoggerService } from './services/logger.service';
import { SwarmController } from './api/swarm.controller';

dotenv.config();

// Prevent any uncaught async rejection from crashing the process.
// Engines have their own catch blocks; this is a last-resort safety net.
process.on('unhandledRejection', (reason: any) => {
  process.stdout.write(`[WARN] Unhandled rejection (non-fatal): ${reason?.message || reason}\n`);
});
process.on('uncaughtException', (err: Error) => {
  process.stdout.write(`[WARN] Uncaught exception (non-fatal): ${err.message}\n`);
});

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
(process.stdout as any).write = function(chunk: any, encoding: any, cb: any) {
  if (typeof chunk === 'string') {
    const skipStrings = [
      'Starting download to:',
      'Downloading single file',
      'Getting file locations for root hash',
      'Found 4 locations for',
      'Selected 2 of 4 nodes',
      'Single file upload completed',
      'Starting upload for file',
      'Upload options:',
      'First selected node status',
      'Selected nodes:',
      'Using splitable upload',
      'File details - size:',
      'Data prepared to upload',
      'Attempting to find existing file',
      'Waiting for storage node to sync'
    ];
    if (skipStrings.some(s => chunk.includes(s))) return true;
  }
  return originalStdoutWrite(chunk, encoding, cb);
};

const sysLog = (msg: string) => process.stdout.write(msg + '\n');

async function main() {
  const blockchain = new BlockchainService();
  const storage = new StorageService(blockchain.agentOgWallet);
  const logger = new LoggerService();
  const controller = new SwarmController(blockchain, storage, logger);

  await controller.resyncAgents();

  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: true });

  fastify.get('/', async () => {
    return { status: 'ok', service: 'SwarmSwap', timestamp: new Date().toISOString() };
  });

  // GET /api/agent — return the agent's EOA for frontend delegation scoping
  fastify.get('/api/agent', async () => {
    return { agentAddress: blockchain.agentWallet.address };
  });

  // POST /api/swarms/init — create a new swarm
  fastify.post('/api/swarms/init', async (request, reply) => {
    sysLog('\n--- Received POST /api/swarms/init ---');
    try {
      const { userAddress, amount, smartAccountAddress, delegation, environmentVersion, pimlicoRpcUrl } = request.body as any;
      sysLog(`Creating swarm for Smart Account: ${smartAccountAddress}`);
      const addr = (userAddress || blockchain.agentWallet.address) as Address;
      const result = await controller.initializeSwarm(addr, amount || '0.003', smartAccountAddress, delegation, environmentVersion, pimlicoRpcUrl);
      sysLog('Swarm initialized successfully.');
      return result;
    } catch (err: any) {
      sysLog(`Failed to initialize swarm: ${err.message}`);
      reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/api/swarms', async () => {
    return { swarms: controller.getSwarms() };
  });

  fastify.post('/api/swarms/:swarmId/stop', async (request, reply) => {
    const { swarmId } = request.params as { swarmId: string };
    const result = controller.stopEngine(swarmId);
    if (!result.ok) return reply.status(404).send({ error: result.error });
    return { ok: true };
  });

  fastify.get('/api/swarms/:swarmId/stream', (request, reply) => {
    const { swarmId } = request.params as { swarmId: string };

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.flushHeaders();

    const unsubscribe = logger.subscribe((event) => {
      const d = event.data || {};
      if (!d.swarm_id || d.swarm_id === swarmId || swarmId === 'all') {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    });

    request.raw.on('close', unsubscribe);
  });

  const port = Number(process.env.PORT) || 3001;
  await fastify.listen({ port, host: '0.0.0.0' });
  process.stdout.write(`SwarmSwap API running on http://localhost:${port}\n`);
}

main().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
