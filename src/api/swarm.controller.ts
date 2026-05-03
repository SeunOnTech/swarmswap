import { Contract, ethers, keccak256, JsonRpcProvider, parseEther, toUtf8Bytes } from 'ethers';
import { Address } from 'viem';
import { BlockchainService } from '../services/blockchain.service';
import { StorageService } from '../services/storage.service';
import { LoggerService } from '../services/logger.service';
import { CONFIG, SWARM_AGENT_ABI, POOL_ABI, allowedAgentsFilter } from '../config/constants';
import { RuntimeConfig, RuntimeState } from '../types';
import { SwarmEngine } from '../core/SwarmEngine';
import { ComputeService } from '../services/compute.service';
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

  /**
   * Creates a new swarm by reusing the existing smart account + delegation
   * already set up on-chain (from the standalone script's --mode setup).
   * This is the correct pattern for the hackathon demo: one smart account,
   * many independent swarms with their own state and iNFT.
   */
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
        delegation_manager: '0x39a00aBe601DE7a731804f3db6E33De6C4eE3B16', // Fallback manager if not provided
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

  /** Returns metadata for all running engines */
  getSwarms() {
    return Array.from(this.engines.entries()).map(([swarmId, engine]) => ({
      swarmId,
      tokenId: engine.tokenId,
      status: engine.getIsRunning() ? 'Active' : 'Stopping'
    }));
  }

  /** Stop the backend execution loop for this swarm (does not burn NFT or revoke on-chain delegation). */
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

  /**
   * On server start: scan 0G Galileo for whitelisted agents and restart their engines.
   */
  async resyncAgents() {
    process.stdout.write('Resyncing existing agents from 0G Galileo...\n');
    const swarmAgent = new Contract(CONFIG.CONTRACTS.SWARM_AGENT, SWARM_AGENT_ABI, this.blockchain.agentOgWallet);

    try {
      const total = await swarmAgent.totalAgents();
      process.stdout.write(`Found ${total} agents in the registry.\n`);

      const allowedOnly = allowedAgentsFilter();
      if (allowedOnly === null) process.stdout.write('Resync: starting engines for all agent token IDs (set ALLOWED_AGENT_IDS to restrict).\n');
      else process.stdout.write(`Resync: whitelist token IDs only: ${allowedOnly.join(', ')}\n`);
      for (let i = 1; i <= Number(total); i++) {
        if (allowedOnly !== null && !allowedOnly.includes(i)) continue;

        try {
          const agentData = await swarmAgent.agents(i);
          const configRootHash = (agentData.configURI as string).replace(/^ipfs:\/\//, '');
          const config = await this.storage.downloadJson(configRootHash) as RuntimeConfig;
          const swarmId = config.swarmId || `recovered-${i}`;

          if (this.engines.has(swarmId)) continue;
          process.stdout.write(`Restarting agent for Swarm: ${swarmId} (Token: ${i})\n`);
          await this.startEngine(swarmId, i.toString());
        } catch (err: any) {
          console.error(`Failed to recover agent ${i}:`, err.message);
        }
      }
    } catch (err: any) {
      console.error('Failed to resync agents:', err.message);
    }
  }
}
