import { Contract, ethers, keccak256, JsonRpcProvider, parseEther, toUtf8Bytes } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { Address } from 'viem';
import { BlockchainService } from '../services/blockchain.service';
import { StorageService } from '../services/storage.service';
import { LoggerService } from '../services/logger.service';
import { CONFIG, SWARM_AGENT_ABI, POOL_ABI } from '../config/constants';
import { RuntimeConfig, RuntimeState } from '../types';
import { SwarmEngine } from '../core/SwarmEngine';
import { ComputeService } from '../services/compute.service';
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit';
import { SwapService } from '../services/swap.service';

export class SwarmController {
  private blockchain: BlockchainService;
  private storage: StorageService;
  private logger: LoggerService;
  public engines: Map<string, SwarmEngine> = new Map();

  constructor(blockchain: BlockchainService, storage: StorageService, logger: LoggerService) {
    this.blockchain = blockchain;
    this.storage = storage;
    this.logger = logger;
  }

  private async fetchInitialTick(): Promise<number> {
    try {
      const rpcUrl = process.env.MAINNET_RPC_URL;
      if (rpcUrl) {
        const provider = new JsonRpcProvider(rpcUrl, CONFIG.MAINNET.chainId, { staticNetwork: true });
        const pool = new Contract(CONFIG.CONTRACTS.MAINNET.WETH_USDC_POOL, POOL_ABI, provider);
        const slot0 = await pool.slot0();
        return Number(slot0.tick);
      }
    } catch {}
    return 0;
  }

  async initializeSwarm(
    userAddress: Address,
    amount: string = '0.003',
    smartAccountAddress?: Address,
    delegation?: any,
    environmentVersion?: string,
    pimlicoRpcUrl?: string
  ) {
    const swarmAgent = new Contract(CONFIG.CONTRACTS.SWARM_AGENT, SWARM_AGENT_ABI, this.blockchain.agentOgWallet);

    const swarmId = keccak256(toUtf8Bytes(`${userAddress}-${Date.now()}`)).slice(2, 10);
    const initialTick = await this.fetchInitialTick();

    const configPayload: RuntimeConfig = {
      version: 'erc4337-hybrid-v1',
      pool: 'ETH-USDC-V3',
      feeTier: 3000,
      slippage_bps: CONFIG.SLIPPAGE_BPS,
      execution_chain_id: CONFIG.SEPOLIA.chainId,
      coordination_chain_id: CONFIG.OG_GALILEO.chainId,
      owner_eoa: userAddress,
      agent_delegate: this.blockchain.agentWallet.address as Address,
      smart_account: {
        implementation: 'Hybrid',
        address: smartAccountAddress || ('0x0000000000000000000000000000000000000000' as Address),
        delegation_manager: getSmartAccountsEnvironment(CONFIG.SEPOLIA.chainId, CONFIG.SMART_ACCOUNTS_VERSION).DelegationManager, // Fallback manager if not provided
        pimlico_rpc_url: pimlicoRpcUrl || '',
        environment_version: environmentVersion || CONFIG.SMART_ACCOUNTS_VERSION,
        deployment_user_op_hash: '0x',
        deployment_tx_hash: '0x',
        approval_user_op_hash: '0x',
        approval_tx_hash: '0x'
      },
      delegation: delegation || {},
      swarmId,
      created_at: Math.floor(Date.now() / 1000)
    };

    const statePayload: RuntimeState = {
      token0: CONFIG.TOKENS.WETH.address,
      token1: CONFIG.TOKENS.USDC.address,
      amountIn: parseEther(amount).toString(),
      current_asset: 'WETH',
      current_tick: initialTick,
      last_tick: initialTick,
      initial_tick: initialTick,
      last_consensus_hash: ethers.ZeroHash,
      updated_at: Math.floor(Date.now() / 1000)
    };

    this.logger.emit('UPLOADING', { swarm_id: swarmId, message: 'Persisting config and state to 0G Storage' });
    const configURI = await this.storage.uploadJson(`/swarms/${swarmId}/config.json`, configPayload as Record<string, any>);
    const stateURI = await this.storage.uploadJson(`/swarms/${swarmId}/state_snapshot.json`, statePayload as Record<string, any>);
    this.logger.emit('UPLOADED', { swarm_id: swarmId, config_root: configURI, state_root: stateURI });

    this.logger.emit('MINTING', { swarm_id: swarmId, message: 'Minting ERC-7857 iNFT on 0G Galileo' });
    const mintTx = await swarmAgent.mintAgent(
      userAddress,
      `ipfs://${configURI}`,
      `ipfs://${stateURI}`,
      userAddress,
      500
    );
    await mintTx.wait();
    const tokenId = await swarmAgent.totalAgents();

    this.logger.emit('SETUP_COMPLETE', {
      swarm_id: swarmId,
      token_id: tokenId.toString(),
      smart_account: configPayload.smart_account.address,
      mint_tx: mintTx.hash,
      og_chain: CONFIG.OG_GALILEO.chainId
    });

    try {
      const storageDir = path.join(process.cwd(), 'storage');
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir);
      const backupPath = path.join(storageDir, 'delegations.json');
      let backups: Record<string, any> = {};
      if (fs.existsSync(backupPath)) backups = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      backups[swarmId] = delegation;
      fs.writeFileSync(backupPath, JSON.stringify(backups, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
      process.stdout.write(`Delegation backed up locally for Swarm: ${swarmId}\n`);
    } catch (err: any) {
      console.error('Failed to save local delegation backup:', err.message);
    }

    await this.startEngine(swarmId, tokenId.toString());

    return {
      swarmId,
      tokenId: tokenId.toString(),
      configURI,
      stateURI,
      mintTx: mintTx.hash,
      smartAccount: configPayload.smart_account.address
    };
  }

  getSwarms() {
    return Array.from(this.engines.entries()).map(([swarmId, engine]) => ({
      swarmId,
      tokenId: engine.tokenId,
      status: engine.getIsRunning() ? 'Active' : 'Stopping'
    }));
  }

  stopEngine(swarmId: string): { ok: boolean; error?: string } {
    const engine = this.engines.get(swarmId);
    if (!engine) return { ok: false, error: 'No running engine for this swarm id' };
    engine.stop();
    return { ok: true };
  }

  private async startEngine(swarmId: string, tokenId: string) {
    const swap = new SwapService();
    const compute = new ComputeService(this.blockchain.agentOgWallet);
    await compute.init();

    const engine = new SwarmEngine(
      this.blockchain,
      this.storage,
      swap,
      compute,
      this.logger,
      swarmId,
      tokenId
    );

    this.engines.set(swarmId, engine);
    engine
      .start()
      .catch(err => {
        this.logger.emit('ERROR', { swarm_id: swarmId, message: `Engine crashed: ${err.message}` });
      })
      .finally(() => {
        this.engines.delete(swarmId);
      });
  }

  async resyncAgents() {
    process.stdout.write('Resyncing existing agents from 0G Galileo...\n');
    const swarmAgent = new Contract(CONFIG.CONTRACTS.SWARM_AGENT, SWARM_AGENT_ABI, this.blockchain.agentOgWallet);

    try {
      const total = Number(await swarmAgent.totalAgents());
      process.stdout.write(`Found ${total} agents in the registry.\n`);
      if (total === 0) return;

      const latestId = total;
      process.stdout.write(`Resync: starting latest agent only (token #${latestId}).\n`);

      try {
        const agentData = await swarmAgent.agents(latestId);
        const configRootHash = (agentData.configURI as string).replace(/^ipfs:\/\//, '');
        const config = await this.storage.downloadJson(configRootHash) as any;
        const swarmId = config.id || keccak256(toUtf8Bytes(latestId.toString())).slice(2, 10);

        process.stdout.write(`Restarting agent for Swarm: ${swarmId} (Token: ${latestId})\n`);
        await this.startEngine(swarmId, latestId.toString());
      } catch (err: any) {
        process.stdout.write(`Failed to resync agent #${latestId}: ${err.message}\n`);
      }
    } catch (err: any) {
      process.stdout.write(`Resync failed: ${err.message}\n`);
    }
  }
}
