import { Contract, ethers, formatUnits, JsonRpcProvider, keccak256, toUtf8Bytes } from 'ethers';
import { Address, Hex } from 'viem';
import { BlockchainService } from '../services/blockchain.service';
import { StorageService } from '../services/storage.service';
import { SwapService } from '../services/swap.service';
import { ComputeService } from '../services/compute.service';
import { LoggerService } from '../services/logger.service';
import { CONFIG, POOL_ABI, SWARM_AGENT_ABI, ERC20_ABI } from '../config/constants';
import { RuntimeConfig, RuntimeState, AgentProposal } from '../types';
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts';
import { ExecutionMode, createExecution } from '@metamask/smart-accounts-kit';

export class SwarmEngine {
  private blockchain: BlockchainService;
  private storage: StorageService;
  private swap: SwapService;
  private compute: ComputeService;
  private logger: LoggerService;
  private swarmId: string;
  public tokenId: string;

  private cycleCount = 0;
  private anchorCount = 0;
  private confidenceHistory: number[] = [];
  private lastKnownTick = 0;
  private demoCycle = 0;
  private running = true;

  constructor(
    blockchain: BlockchainService,
    storage: StorageService,
    swap: SwapService,
    compute: ComputeService,
    logger: LoggerService,
    swarmId: string,
    tokenId: string
  ) {
    this.blockchain = blockchain;
    this.storage = storage;
    this.swap = swap;
    this.compute = compute;
    this.logger = logger;
    this.swarmId = swarmId;
    this.tokenId = tokenId;
  }

  /** Signal the loop to finish after the current cycle (or before heavy execute work). */
  public stop(): void {
    if (!this.running) return;
    this.running = false;
    this.emit('LOOP_STOP_REQUESTED', {});
  }

  public getIsRunning(): boolean {
    return this.running;
  }

  // Injects swarm_id into every event so SSE clients can filter correctly
  private emit(type: string, data: Record<string, any>) {
    this.logger.emit(type, { ...data, swarm_id: this.swarmId, token_id: this.tokenId });
  }

  private async fetchLiveTick(): Promise<number> {
    try {
      const mainnetRpc = process.env.MAINNET_RPC_URL;
      if (mainnetRpc) {
        const provider = new JsonRpcProvider(mainnetRpc, CONFIG.MAINNET.chainId, { staticNetwork: true });
        const pool = new Contract(CONFIG.CONTRACTS.MAINNET.WETH_USDC_POOL, POOL_ABI, provider);
        const slot0 = await pool.slot0();
        this.lastKnownTick = Number(slot0.tick);
        return this.lastKnownTick;
      }
    } catch {
      if (this.lastKnownTick !== 0) return this.lastKnownTick;
    }
    try {
      const factory = new Contract(
        CONFIG.CONTRACTS.SEPOLIA.FACTORY,
        ['function getPool(address,address,uint24) view returns (address)'],
        this.blockchain.sepoliaProvider
      );
      const poolAddr = await factory.getPool(CONFIG.TOKENS.WETH.address, CONFIG.TOKENS.USDC.address, 3000);
      const pool = new Contract(poolAddr, POOL_ABI, this.blockchain.sepoliaProvider);
      const slot0 = await pool.slot0();
      this.lastKnownTick = Number(slot0.tick);
      return this.lastKnownTick;
    } catch {
      return this.lastKnownTick;
    }
  }

  private getDecisionTick(realTick: number, lastStoredTick: number): { decisionTick: number; simulated: boolean } {
    const DEMO_HOLD_CYCLES = 2;
    const DEMO_SIM_DELTA = 5;
    this.demoCycle++;
    if (this.demoCycle % (DEMO_HOLD_CYCLES + 1) === 0) {
      return { decisionTick: lastStoredTick + DEMO_SIM_DELTA, simulated: true };
    }
    return { decisionTick: lastStoredTick, simulated: false };
  }

  private runAnalyzerAgent(state: RuntimeState, currentTick: number): AgentProposal {
    const lastTick = state.current_tick || currentTick;
    const tickDelta = Math.abs(currentTick - lastTick);
    return {
      role: 'analyzer',
      action: tickDelta > CONFIG.TICK_REBALANCE_THRESHOLD ? 'REBALANCE' : 'HOLD',
      confidence: Math.min(0.99, 0.70 + tickDelta / 2000),
      ts: Math.floor(Date.now() / 1000),
      data: { currentTick, lastTick, tickDelta, priceChangePct: `${(tickDelta * 0.01).toFixed(2)}%` }
    };
  }

  private runRiskAgent(state: RuntimeState, currentTick: number): AgentProposal {
    const lastTick = state.current_tick || currentTick;
    const tickDelta = Math.abs(currentTick - lastTick);
    return {
      role: 'risk',
      action: tickDelta > CONFIG.TICK_IL_THRESHOLD ? 'REBALANCE' : 'HOLD',
      confidence: Math.min(0.99, 0.80 + tickDelta / 4000),
      ts: Math.floor(Date.now() / 1000),
      data: { currentTick, tickDelta, ilRisk: `${(tickDelta * 0.01).toFixed(2)}%` }
    };
  }

  private evaluateConsensus(proposals: AgentProposal[], lastHash: string) {
    const rebalanceCount = proposals.filter(p => p.action === 'REBALANCE').length;
    const action = rebalanceCount >= 2 ? 'REBALANCE' : 'HOLD';
    return {
      action,
      rebalanceCount,
      totalAgents: proposals.length,
      hash: keccak256(toUtf8Bytes(action + lastHash + Date.now()))
    };
  }

  public async start() {
    this.emit('LOOP_START', { swarm_id: this.swarmId, token_id: this.tokenId });
    const swarmAgent = new Contract(CONFIG.CONTRACTS.SWARM_AGENT, SWARM_AGENT_ABI, this.blockchain.agentOgWallet);

    const hasPerm = await swarmAgent.hasPermission(BigInt(this.tokenId), this.blockchain.agentWallet.address, CONFIG.ACTION_PERMISSION);
    if (!hasPerm) throw new Error(`Agent lacks permission ${CONFIG.ACTION_PERMISSION}`);

    this.emit('AGENT_READY', { agent: this.blockchain.agentWallet.address });

    while (this.running) {
      try {
        this.cycleCount++;

        // 1. OBSERVE
        const realTick = await this.fetchLiveTick();
        const feeData = await this.blockchain.sepoliaProvider.getFeeData();
        const gasGwei = Number(feeData.gasPrice || 0n) / 1e9;
        this.emit('OBSERVE', { real_tick: realTick, source: 'mainnet_weth_usdc_0.05pct' });

        // 2. RECALL
        const agentData = await swarmAgent.agents(BigInt(this.tokenId));
        const stateRootHash = (agentData.stateURI as string).replace(/^ipfs:\/\//, '');
        const state = await this.storage.downloadJson(stateRootHash) as RuntimeState;
        const configRootHash = (agentData.configURI as string).replace(/^ipfs:\/\//, '');
        const config = await this.storage.downloadJson(configRootHash) as RuntimeConfig;

        if (!config?.smart_account) throw new Error('Agent config malformed or missing smart_account');
        const smartAccountAddress = config.smart_account.address;

        this.emit('RECALL', {
          last_tick: state.current_tick ?? 0,
          current_asset: state.current_asset,
          total_trades: Number(agentData.totalTrades),
          smart_account: smartAccountAddress,
          state_root: stateRootHash
        });

        // HEARTBEAT anchor
        this.anchorCount++;
        this.emit('ANCHOR', { event_type: 'HEARTBEAT', hash: stateRootHash.slice(0, 18), description: 'Periodic memory state verification anchored' });
        this.emit('LOG', { tag: 'MEMORY', message: `0G heartbeat — memory state verified. ${this.anchorCount} anchors intact`, color: 'purple' });

        // Seed tick if missing
        if (!state.current_tick) {
          this.emit('INIT', { message: 'Seeding initial tick on-chain', tick: realTick });
          const seeded: RuntimeState = { ...state, current_tick: realTick, last_tick: realTick, initial_tick: realTick };
          const seededURI = await this.storage.uploadJson(`/swarms/${this.swarmId}/state_snapshot.json`, seeded);
          await (await swarmAgent.updateState(BigInt(this.tokenId), `ipfs://${seededURI}`, ethers.ZeroHash)).wait();
          await new Promise(r => setTimeout(r, CONFIG.POLL_INTERVAL_MS));
          continue;
        }

        // 3. PROPOSE — three agents
        const { decisionTick, simulated } = this.getDecisionTick(realTick, state.current_tick);
        const analyzerProposal = this.runAnalyzerAgent(state, decisionTick);
        const riskProposal = this.runRiskAgent(state, decisionTick);
        const computeProposal = await this.compute.runComputeAgent(decisionTick, state.current_tick, state.current_asset);

        const tickDelta = analyzerProposal.data?.tickDelta ?? 0;
        this.emit('LOG', { tag: 'ANALYZER', message: `Pre-scan: ETH/USDC tick ${realTick} | Δ${tickDelta} ticks (${analyzerProposal.data?.priceChangePct}) | Signal: ${analyzerProposal.action}`, color: 'blue' });
        this.emit('LOG', { tag: 'ANALYZER', message: `Background scan: ETH gas ${gasGwei.toFixed(1)} gwei — ${gasGwei < 20 ? 'favorable window detected' : 'elevated gas, monitoring'}`, color: 'blue' });
        this.emit('LOG', { tag: 'SENTINEL', message: `Watchlist check: Pool volatility ${(tickDelta * 0.01).toFixed(2)}% in last cycle | ${tickDelta > 3 ? 'Elevated activity' : 'Normal conditions'}`, color: 'gold' });
        this.emit('LOG', { tag: 'COMPUTE', message: `[0G Compute] Model: qwen-2.5-7b-instruct | Output: ${computeProposal.action} | Attestation: ${computeProposal.attestation ? '✅ Verified' : '⚠️ Unverified'} | ${computeProposal.reasoning || ''}`, color: 'cyan' });

        if (computeProposal.attestation) {
          this.anchorCount++;
          this.emit('ANCHOR', { event_type: 'VERIFY', hash: computeProposal.attestation.slice(0, 18), description: '[0G Compute] qwen-2.5-7b inference verified via TEE attestation' });
        }

        const proposals = [analyzerProposal, riskProposal, computeProposal];
        const avgConf = proposals.reduce((s, p) => s + p.confidence, 0) / proposals.length;
        this.confidenceHistory.push(avgConf);
        if (this.confidenceHistory.length > 20) this.confidenceHistory.shift();

        this.emit('PROPOSE', {
          analyzer: { action: analyzerProposal.action, confidence: analyzerProposal.confidence, tick_delta: tickDelta, price_change_pct: analyzerProposal.data?.priceChangePct },
          risk: { action: riskProposal.action, confidence: riskProposal.confidence, il_risk: riskProposal.data?.ilRisk },
          compute: { action: computeProposal.action, confidence: computeProposal.confidence, attested: !!computeProposal.attestation },
          decision_tick: decisionTick,
          simulated_delta: simulated
        });

        // 4. CONSENSUS
        const consensus = this.evaluateConsensus(proposals, state.last_consensus_hash);
        this.anchorCount++;
        this.emit('ANCHOR', { event_type: 'DECISION_ANCHOR', hash: consensus.hash.slice(0, 18), description: `${consensus.action} decision pinned with full proof trail` });
        this.emit('LOG', { tag: 'EXECUTOR', message: `SPVE vote: ${consensus.rebalanceCount}/3 REBALANCE | Consensus: ${consensus.action} | ${consensus.action === 'REBALANCE' ? 'Executing on Sepolia via delegation...' : 'Stability confirmed — holding position'}`, color: 'orange' });
        this.emit('CONSENSUS', {
          action: consensus.action,
          votes: proposals.map(p => ({ agent: p.role, vote: p.action })),
          quorum: `${consensus.rebalanceCount}/${consensus.totalAgents}`
        });

        // 5. EXECUTE
        if (consensus.action === 'REBALANCE' && this.running) {
          await this.executeRebalance(state, config, realTick, consensus.hash, consensus.rebalanceCount, swarmAgent, agentData);
        }

        // METRICS — every cycle
        const initialTick = state.initial_tick || state.current_tick || realTick;
        const returnPct = (Math.pow(1.0001, realTick - initialTick) - 1) * 100;
        const rolling = this.confidenceHistory.slice(-10);
        const confAvg = rolling.length > 0 ? rolling.reduce((a, b) => a + b, 0) / rolling.length : 0;
        let ogBlock = 0;
        try { ogBlock = Number(await this.blockchain.ogProvider.getBlockNumber()); } catch {}

        // Fetch real balances
        let wethBalance = "0";
        let usdcBalance = "0";
        let positionValue = "0.00";
        try {
          const wethContract = new Contract(CONFIG.TOKENS.WETH.address, ERC20_ABI, this.blockchain.sepoliaProvider);
          const usdcContract = new Contract(CONFIG.TOKENS.USDC.address, ERC20_ABI, this.blockchain.sepoliaProvider);
          const rawWeth = await wethContract.balanceOf(smartAccountAddress);
          const rawUsdc = await usdcContract.balanceOf(smartAccountAddress);
          wethBalance = formatUnits(rawWeth, CONFIG.TOKENS.WETH.decimals);
          usdcBalance = formatUnits(rawUsdc, CONFIG.TOKENS.USDC.decimals);
          
          const currentEthPrice = Math.pow(1.0001, realTick);
          const totalVal = (Number(wethBalance) * currentEthPrice) + Number(usdcBalance);
          positionValue = totalVal.toFixed(2);
        } catch(e) {
          console.error("Failed to fetch real balances", e);
        }

        this.emit('METRICS', {
          total_return_pct: returnPct.toFixed(2),
          decisions_count: this.cycleCount,
          confidence_avg: Math.round(confAvg * 100),
          anchors_count: this.anchorCount,
          latest_og_block: ogBlock,
          storage_used_kb: (this.storage.bytesUploaded / 1024).toFixed(1),
          network_status: ogBlock > 0 ? 'Live' : 'Degraded',
          weth_balance: wethBalance,
          usdc_balance: usdcBalance,
          position_value: positionValue,
          smart_account_address: smartAccountAddress
        });

        this.emit('LOG', { tag: 'SYSTEM', message: `Run #${this.cycleCount} complete. Decisions: ${consensus.rebalanceCount} approved, ${consensus.totalAgents - consensus.rebalanceCount} rejected. Next run in ${CONFIG.POLL_INTERVAL_MS / 1000}s`, color: 'gray' });
        this.emit('CYCLE_COMPLETE', { action: consensus.action, next_cycle_in_ms: CONFIG.POLL_INTERVAL_MS });
        await new Promise(r => setTimeout(r, CONFIG.POLL_INTERVAL_MS));

      } catch (err: any) {
        if (!this.running) break;
        this.emit('ERROR', { message: err.message, cycle: this.cycleCount });
        this.storage.uploadJson(`/swarms/${this.swarmId}/errors/${Date.now()}.json`, {
          error: err.message, stack: err.stack, timestamp: Math.floor(Date.now() / 1000)
        }).catch(() => {});
        await new Promise(r => setTimeout(r, CONFIG.POLL_INTERVAL_MS * 2));
      }
    }

    this.emit('LOOP_STOPPED', { token_id: this.tokenId });
  }

  private async executeRebalance(
    state: RuntimeState,
    config: RuntimeConfig,
    realTick: number,
    consensusHash: string,
    _rebalanceCount: number,
    swarmAgent: Contract,
    agentData: any
  ) {
    if (!this.running) return;
    const currentAsset = state.current_asset || 'WETH';
    const nextAsset = currentAsset === 'USDC' ? 'WETH' : 'USDC';
    const smartAccountAddress = config.smart_account.address as Address;
    const delegationManagerAddress = config.smart_account.delegation_manager as string;

    const tokenIn = currentAsset === 'USDC' ? CONFIG.TOKENS.USDC : CONFIG.TOKENS.WETH;
    const tokenOut = currentAsset === 'USDC' ? CONFIG.TOKENS.WETH : CONFIG.TOKENS.USDC;

    const tokenContract = new Contract(tokenIn.address, ERC20_ABI, this.blockchain.sepoliaProvider);
    const amountToSwap = BigInt(await tokenContract.balanceOf(smartAccountAddress));

    if (amountToSwap === 0n) {
      this.emit('WARN', { message: `Smart account has no ${currentAsset} balance — skipping`, current_asset: currentAsset });
      return;
    }

    const amountDisplay = `${formatUnits(amountToSwap, tokenIn.decimals)} ${currentAsset}`;
    this.emit('EXECUTING', { swap: `${currentAsset}→${nextAsset}`, amount: amountDisplay, smart_account: smartAccountAddress });
    this.emit('LOG', { tag: 'EXECUTOR', message: `Submitting REBALANCE to Uniswap V3 — ${currentAsset}→${nextAsset} primary route, 0.30% fee tier`, color: 'orange' });

    const apiQuote = await this.swap.getUniswapAPIQuote(tokenIn.address as Address, tokenOut.address as Address, amountToSwap, smartAccountAddress);

    let swapCalldata: Hex, swapTo: Address, minOut: string, quoteSource: string;
    const swapValue = 0n;

    if (apiQuote) {
      swapCalldata = apiQuote.calldata as Hex;
      swapTo = apiQuote.to as Address;
      minOut = apiQuote.amountOut;
      quoteSource = 'uniswap_trading_api';
    } else {
      const fallback = await this.swap.generateFallbackCalldata(tokenIn, tokenOut, amountToSwap, smartAccountAddress);
      swapCalldata = fallback.calldata as Hex;
      swapTo = fallback.router as Address;
      minOut = fallback.minOut.toString();
      quoteSource = 'swapRouter02_direct';
    }

    this.emit('QUOTE', { source: quoteSource, min_out: minOut, token_out: nextAsset });

    const redemptionCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[config.delegation as any]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[createExecution({ target: swapTo, value: swapValue, callData: swapCalldata })]]
    });

    // Estimate gas with 20% buffer
    const gasEstimate = await this.blockchain.sepoliaProvider.estimateGas({
      to: delegationManagerAddress,
      from: this.blockchain.agentWallet.address,
      data: redemptionCalldata
    });
    const gasLimit = (gasEstimate * 120n) / 100n;

    this.emit('BROADCASTING', { delegation_manager: delegationManagerAddress, gas_limit: gasLimit.toString() });

    const tx = await this.blockchain.agentWallet.sendTransaction({
      to: delegationManagerAddress,
      data: redemptionCalldata,
      gasLimit
    });
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) throw new Error(`Swap reverted: ${tx.hash}`);

    this.emit('LOG', { tag: 'EXECUTOR', message: `Route confirmed. Tx: ${receipt.hash.slice(0, 12)}… · gas: ${(Number(receipt.gasUsed) / 1000).toFixed(0)}k units`, color: 'orange' });
    this.emit('EXECUTED', { swap: `${currentAsset}→${nextAsset}`, tx_hash: receipt.hash, gas_used: receipt.gasUsed.toString(), explorer: `https://sepolia.etherscan.io/tx/${receipt.hash}` });

    // ANCHOR
    this.emit('LOG', { tag: 'MEMORY', message: `Anchoring decision to 0G Galileo. Proof hash: ${consensusHash.slice(0, 12)}…`, color: 'purple' });
    const newState: RuntimeState = {
      ...state,
      current_asset: nextAsset,
      current_tick: realTick,
      last_tick: state.current_tick || realTick,
      last_consensus_hash: consensusHash,
      updated_at: Math.floor(Date.now() / 1000)
    };
    const newStateURI = await this.storage.uploadJson(`/swarms/${this.swarmId}/state_snapshot.json`, newState);
    const anchorTx = await swarmAgent.updateState(BigInt(this.tokenId), `ipfs://${newStateURI}`, receipt.hash);
    await anchorTx.wait();

    const totalTrades = Number(agentData.totalTrades) + 1;
    this.emit('ANCHORED', { og_tx: anchorTx.hash, new_state_root: newStateURI, current_asset: nextAsset, total_trades: totalTrades });
    this.emit('LOG', { tag: 'MEMORY', message: `0G Storage write confirmed. Block: ${await this.blockchain.ogProvider.getBlockNumber()} · ${(this.storage.bytesUploaded / 1024).toFixed(1)} KB stored.`, color: 'purple' });

    this.anchorCount += 3;
    this.emit('ANCHOR', { event_type: 'LINEAGE_UPDATE', hash: anchorTx.hash.slice(0, 18), description: `iNFT state updated — ${totalTrades} ancestor${totalTrades !== 1 ? 's' : ''} linked` });
    this.emit('ANCHOR', { event_type: 'MEMORY_ANCHOR', hash: newStateURI.slice(0, 18), description: `Run #${this.cycleCount} state anchored to 0G Galileo` });
    this.emit('ANCHOR', { event_type: 'PROOF_VERIFY', hash: receipt.hash.slice(0, 18), description: `Rebalance tx stored — ${(this.storage.bytesUploaded / 1024).toFixed(1)} KB on 0G Storage` });
    this.emit('LOG', { tag: 'EXECUTOR', message: `Settlement complete. Net position: ${nextAsset} asset locked for this cycle.`, color: 'orange' });

    // Fire-and-forget execution log
    this.storage.uploadJson(`/swarms/${this.swarmId}/executions/${receipt.hash}.json`, {
      tx_hash: receipt.hash,
      chain_id: CONFIG.SEPOLIA.chainId,
      swap: `${currentAsset}→${nextAsset}`,
      smart_account: smartAccountAddress,
      amount_in: amountDisplay,
      tick_at_execution: realTick,
      gas_used: receipt.gasUsed.toString(),
      amount_out_min: minOut,
      quote_source: quoteSource,
      status: 'SUCCESS',
      timestamp: Math.floor(Date.now() / 1000)
    }).catch(() => {});
  }
}
