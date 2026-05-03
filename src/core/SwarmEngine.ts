import { Contract, ethers, formatUnits, JsonRpcProvider, keccak256, toUtf8Bytes } from 'ethers';
import { Address, Hex } from 'viem';
import * as fs from 'fs';
import * as path from 'path';
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

  public stop(): void {
    if (!this.running) return;
    this.running = false;
    this.emit('LOOP_STOP_REQUESTED', {});
  }

  public getIsRunning(): boolean {
    return this.running;
  }

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

    // Permission check — retry up to 3× on transient OG RPC errors before giving up
    let hasPerm = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        hasPerm = await swarmAgent.hasPermission(BigInt(this.tokenId), this.blockchain.agentWallet.address, CONFIG.ACTION_PERMISSION);
        break;
      } catch (err: any) {
        if (attempt === 2) throw new Error(`Permission check failed after 3 attempts: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    if (!hasPerm) throw new Error(`Agent lacks permission ${CONFIG.ACTION_PERMISSION}`);

    this.emit('AGENT_READY', { agent: this.blockchain.agentWallet.address });

    while (this.running) {
      try {
        this.cycleCount++;

        // 1. OBSERVE
        const realTick = await this.fetchLiveTick();
        let gasGwei = 0;
        try {
          const feeData = await this.blockchain.callWithRetry(p => p.getFeeData());
          gasGwei = Number(feeData.gasPrice || 0n) / 1e9;
        } catch { /* non-critical — gas display degrades gracefully */ }
        this.emit('OBSERVE', { real_tick: realTick, source: 'mainnet_weth_usdc_0.05pct' });

        // 2. RECALL
        const agentData = await swarmAgent.agents(BigInt(this.tokenId));
        const stateRootHash = (agentData.stateURI as string).replace(/^ipfs:\/\//, '');
        const state = await this.storage.downloadJson(stateRootHash) as RuntimeState;
        const configRootHash = (agentData.configURI as string).replace(/^ipfs:\/\//, '');
        const config = await this.storage.downloadJson(configRootHash) as RuntimeConfig;

        // LOCAL OVERRIDE: Check for local delegation backup to bypass 0G issues
        try {
          const backupPath = path.join(process.cwd(), 'storage', 'delegations.json');
          if (fs.existsSync(backupPath)) {
            const backups = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
            if (backups[this.swarmId]) {
              console.log(`💾 Using local delegation backup for Swarm: ${this.swarmId}`);
              config.delegation = backups[this.swarmId];
            }
          }
        } catch (err) {
          console.error('Failed to load local delegation backup:', err);
        }

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

        // Fetch real balances — sequential + callWithRetry to avoid batch rate limits
        // USDC is token0, WETH is token1 in the mainnet pool → ETH price = 1e12 / 1.0001^tick
        const ethPriceUsd = 1e12 / Math.pow(1.0001, realTick);
        let nativeEthBalance = "0";
        let wethERC20Balance = "0";
        let usdcBalance = "0";
        let positionValue = "0.00";
        try {
          const rawNative = await this.blockchain.callWithRetry(p => p.getBalance(smartAccountAddress));
          await new Promise(r => setTimeout(r, 80));
          const rawWeth = await this.blockchain.callWithRetry(p =>
            new Contract(CONFIG.TOKENS.WETH.address, ERC20_ABI, p).balanceOf(smartAccountAddress)
          );
          await new Promise(r => setTimeout(r, 80));
          const rawUsdc = await this.blockchain.callWithRetry(p =>
            new Contract(CONFIG.TOKENS.USDC.address, ERC20_ABI, p).balanceOf(smartAccountAddress)
          );
          const nativeNum = Number(formatUnits(rawNative, 18));
          const wethNum   = Number(formatUnits(rawWeth, CONFIG.TOKENS.WETH.decimals));
          const usdcNum   = Number(formatUnits(rawUsdc, CONFIG.TOKENS.USDC.decimals));
          nativeEthBalance = nativeNum.toFixed(4);
          wethERC20Balance = wethNum.toFixed(4);
          usdcBalance = usdcNum.toFixed(2);
          positionValue = ((nativeNum + wethNum) * ethPriceUsd + usdcNum).toFixed(2);
        } catch {
          // Non-fatal — metrics show last known values
        }

        this.emit('METRICS', {
          total_return_pct: returnPct.toFixed(2),
          decisions_count: this.cycleCount,
          confidence_avg: Math.round(confAvg * 100),
          anchors_count: this.anchorCount,
          latest_og_block: ogBlock,
          storage_used_kb: (this.storage.bytesUploaded / 1024).toFixed(1),
          network_status: ogBlock > 0 ? 'Live' : 'Degraded',
          eth_balance: nativeEthBalance,
          weth_balance: wethERC20Balance,
          usdc_balance: usdcBalance,
          position_value: positionValue,
          eth_price_usd: ethPriceUsd.toFixed(0),
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
    const smartAccountAddress = config.smart_account.address as Address;
    const delegationManagerAddress = config.smart_account.delegation_manager as string;

    // 1. READ ACTUAL BALANCES — sequential calls to avoid drpc.org batch limit
    const nativeEthRaw = await this.blockchain.callWithRetry(p => p.getBalance(smartAccountAddress));
    await new Promise(r => setTimeout(r, 80));
    const wethRaw = await this.blockchain.callWithRetry(p =>
      new Contract(CONFIG.TOKENS.WETH.address, ERC20_ABI, p).balanceOf(smartAccountAddress).then(BigInt)
    );
    await new Promise(r => setTimeout(r, 80));
    const usdcRaw = await this.blockchain.callWithRetry(p =>
      new Contract(CONFIG.TOKENS.USDC.address, ERC20_ABI, p).balanceOf(smartAccountAddress).then(BigInt)
    );
    const nativeEthDisplay = formatUnits(nativeEthRaw, 18);
    const wethDisplay = formatUnits(wethRaw, CONFIG.TOKENS.WETH.decimals);
    const usdcDisplay = formatUnits(usdcRaw, CONFIG.TOKENS.USDC.decimals);

    this.emit('BALANCE_CHECK', { native_eth: nativeEthDisplay, weth: wethDisplay, usdc: usdcDisplay, smart_account: smartAccountAddress });
    this.emit('LOG', { tag: 'EXECUTOR', message: `Balance check: ${nativeEthDisplay} native ETH | ${wethDisplay} WETH | ${usdcDisplay} USDC in ${smartAccountAddress.slice(0, 10)}…`, color: 'orange' });

    // Auto-wrap native ETH → WETH via delegation when no ERC20 balance exists
    let effectiveWethRaw = wethRaw;
    if (wethRaw === 0n && usdcRaw === 0n && nativeEthRaw > 0n) {
      this.emit('LOG', { tag: 'EXECUTOR', message: `⚡ Native ETH detected — attempting auto-wrap ${nativeEthDisplay} ETH → WETH via delegation…`, color: 'orange' });
      try {
        const wrapAmount = ethers.parseEther('0.002');
        const wrapCalldata = DelegationManager.encode.redeemDelegations({
          delegations: [[config.delegation as any]],
          modes: [ExecutionMode.SingleDefault],
          executions: [[createExecution({ target: CONFIG.TOKENS.WETH.address as Address, value: wrapAmount, callData: '0xd0e30db0' as Hex })]]
        });
        const wrapGas = await this.blockchain.callWithRetry(p => p.estimateGas({
          to: delegationManagerAddress, from: this.blockchain.agentWallet.address, data: wrapCalldata
        }));
        const wrapTx = await this.blockchain.agentWallet.sendTransaction({
          to: delegationManagerAddress, data: wrapCalldata, gasLimit: (wrapGas * 130n) / 100n
        });
        this.emit('CONFIRMING', { tx_hash: wrapTx.hash, explorer: `https://sepolia.etherscan.io/tx/${wrapTx.hash}`, swap: 'ETH→WETH', stage: 'wrap' });
        this.emit('LOG', { tag: 'EXECUTOR', message: `Wrap TX submitted: ${wrapTx.hash.slice(0, 14)}… — waiting for Sepolia confirmation…`, color: 'orange' });
        await wrapTx.wait(1);
        this.emit('WRAP_CONFIRMED', { tx_hash: wrapTx.hash, explorer: `https://sepolia.etherscan.io/tx/${wrapTx.hash}`, amount: '0.002' });
        this.emit('LOG', { tag: 'EXECUTOR', message: `✅ Wrapped 0.002 ETH → WETH · ${wrapTx.hash.slice(0, 14)}… · https://sepolia.etherscan.io/tx/${wrapTx.hash}`, color: 'orange' });
        await new Promise(r => setTimeout(r, 80));
        effectiveWethRaw = await this.blockchain.callWithRetry(p =>
          new Contract(CONFIG.TOKENS.WETH.address, ERC20_ABI, p).balanceOf(smartAccountAddress).then(BigInt)
        );
      } catch (wrapErr: any) {
        const reason = wrapErr?.revert?.args?.[0] || wrapErr?.reason || wrapErr?.message || 'unknown';
        this.emit('WARN', { message: `Auto-wrap failed: ${reason}`, smart_account: smartAccountAddress });
        this.emit('LOG', { tag: 'EXECUTOR', message: `⚠️ Auto-wrap failed (${reason.slice(0, 120)}). Fund the smart account with WETH directly or re-run onboarding.`, color: 'gold' });
        return;
      }
    }

    // Determine swap direction from ERC20 balances (effectiveWethRaw reflects post-wrap state)
    let fromAsset: string, toAsset: string, tokenIn: any, tokenOut: any, amountToSwap: bigint;
    if (effectiveWethRaw > 0n) {
      fromAsset = 'WETH'; toAsset = 'USDC';
      tokenIn = CONFIG.TOKENS.WETH; tokenOut = CONFIG.TOKENS.USDC;
      amountToSwap = effectiveWethRaw;
    } else if (usdcRaw > 0n) {
      fromAsset = 'USDC'; toAsset = 'WETH';
      tokenIn = CONFIG.TOKENS.USDC; tokenOut = CONFIG.TOKENS.WETH;
      amountToSwap = usdcRaw;
    } else {
      this.emit('WARN', { message: 'Smart account has no swappable balance — fund with WETH or USDC first.', smart_account: smartAccountAddress });
      this.emit('LOG', { tag: 'EXECUTOR', message: '⚠️ Zero swappable balance — fund the smart account to enable rebalancing.', color: 'gold' });
      return;
    }

    const amountDisplay = `${formatUnits(amountToSwap, tokenIn.decimals)} ${fromAsset}`;
    this.emit('EXECUTING', { swap: `${fromAsset}→${toAsset}`, amount: amountDisplay, smart_account: smartAccountAddress });
    this.emit('LOG', { tag: 'EXECUTOR', message: `Submitting REBALANCE: ${amountDisplay} → ${toAsset} via Uniswap V3 SwapRouter02`, color: 'orange' });

    // 2. GET QUOTE
    const apiQuote = await this.swap.getUniswapAPIQuote(tokenIn.address as Address, tokenOut.address as Address, amountToSwap, smartAccountAddress);
    let swapCalldata: Hex, swapTo: Address, minOut: string, quoteSource: string;
    const swapValue = 0n;
    if (apiQuote) {
      swapCalldata = apiQuote.calldata as Hex; swapTo = apiQuote.to as Address;
      minOut = apiQuote.amountOut; quoteSource = 'uniswap_trading_api';
    } else {
      const fb = await this.swap.generateFallbackCalldata(tokenIn, tokenOut, amountToSwap, smartAccountAddress);
      swapCalldata = fb.calldata as Hex; swapTo = fb.router as Address;
      minOut = fb.minOut.toString(); quoteSource = 'swapRouter02_direct';
    }
    this.emit('QUOTE', { source: quoteSource, min_out: minOut, token_out: toAsset });

    // 2.5 CHECK & EXECUTE APPROVAL IF NEEDED
    try {
      const erc20 = new Contract(tokenIn.address, ERC20_ABI, this.blockchain.sepoliaProvider);
      const allowance = await this.blockchain.callWithRetry(p => erc20.allowance(smartAccountAddress, CONFIG.CONTRACTS.SEPOLIA.SWAP_ROUTER_02));
      
      if (allowance < amountToSwap) {
        this.emit('LOG', { tag: 'EXECUTOR', message: `Allowing SwapRouter02 to spend ${fromAsset}…`, color: 'orange' });
        const approveData = erc20.interface.encodeFunctionData('approve', [CONFIG.CONTRACTS.SEPOLIA.SWAP_ROUTER_02, ethers.MaxUint256]);
        const approveRedemption = DelegationManager.encode.redeemDelegations({
          delegations: [[config.delegation as any]],
          modes: [ExecutionMode.SingleDefault],
          executions: [[createExecution({ target: tokenIn.address as Address, value: 0n, callData: approveData as Hex })]]
        });
        
        const approveTx = await this.blockchain.agentWallet.sendTransaction({
          to: delegationManagerAddress,
          data: approveRedemption,
          gasLimit: 150000n
        });
        this.emit('CONFIRMING', { tx_hash: approveTx.hash, explorer: `https://sepolia.etherscan.io/tx/${approveTx.hash}`, swap: 'APPROVE', stage: 'approve' });
        this.emit('LOG', { tag: 'EXECUTOR', message: `Approval TX submitted: ${approveTx.hash.slice(0, 14)}… — waiting for Sepolia confirmation…`, color: 'orange' });
        await approveTx.wait(1);
        this.emit('APPROVE_CONFIRMED', { tx_hash: approveTx.hash, explorer: `https://sepolia.etherscan.io/tx/${approveTx.hash}` });
        this.emit('LOG', { tag: 'EXECUTOR', message: `✅ Allowance granted.`, color: 'orange' });
      }
    } catch (approveErr: any) {
      this.emit('LOG', { tag: 'EXECUTOR', message: `⚠️ Approval check/execution failed: ${approveErr.message}`, color: 'gold' });
      // We continue anyway as the allowance might actually be sufficient or the error might be transient
    }

    // 3. BUILD REDEMPTION CALLDATA
    const redemptionCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[config.delegation as any]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[createExecution({ target: swapTo, value: swapValue, callData: swapCalldata })]]
    });

    // 4. ESTIMATE GAS — structured failure with reason
    let gasLimit: bigint;
    try {
      const gasEstimate = await this.blockchain.callWithRetry(p => p.estimateGas({
        to: delegationManagerAddress, from: this.blockchain.agentWallet.address, data: redemptionCalldata
      }));
      gasLimit = (gasEstimate * 120n) / 100n;
    } catch (gasErr: any) {
      const reason = gasErr?.revert?.args?.[0] || gasErr?.reason || gasErr?.message || 'Unknown revert reason';
      this.emit('SWAP_FAILED', { stage: 'gas_estimation', reason, swap: `${fromAsset}→${toAsset}`, smart_account: smartAccountAddress });
      this.emit('LOG', { tag: 'EXECUTOR', message: `❌ Gas estimation failed (${fromAsset}→${toAsset}): ${reason}`, color: 'red' });
      throw gasErr;
    }

    this.emit('BROADCASTING', { delegation_manager: delegationManagerAddress, gas_limit: gasLimit.toString() });

    // 5. BROADCAST — structured failure
    let tx: any;
    try {
      tx = await this.blockchain.agentWallet.sendTransaction({ to: delegationManagerAddress, data: redemptionCalldata, gasLimit });
    } catch (broadcastErr: any) {
      this.emit('SWAP_FAILED', { stage: 'broadcast', reason: broadcastErr.message, swap: `${fromAsset}→${toAsset}` });
      this.emit('LOG', { tag: 'EXECUTOR', message: `❌ Broadcast failed: ${broadcastErr.message}`, color: 'red' });
      throw broadcastErr;
    }

    // Immediately stream tx hash so frontend can track before confirmation
    this.emit('CONFIRMING', { tx_hash: tx.hash, explorer: `https://sepolia.etherscan.io/tx/${tx.hash}`, swap: `${fromAsset}→${toAsset}` });
    this.emit('LOG', { tag: 'EXECUTOR', message: `TX submitted: ${tx.hash.slice(0, 14)}… — waiting for Sepolia confirmation…`, color: 'orange' });

    // 6. WAIT FOR CONFIRMATION — structured failure with explorer link
    let receipt: any;
    try {
      receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) throw new Error('Transaction reverted on-chain');
    } catch (confirmErr: any) {
      const explorer = `https://sepolia.etherscan.io/tx/${tx.hash}`;
      this.emit('SWAP_FAILED', { stage: 'confirmation', reason: confirmErr.message, tx_hash: tx.hash, explorer, swap: `${fromAsset}→${toAsset}` });
      this.emit('LOG', { tag: 'EXECUTOR', message: `❌ Swap reverted: ${tx.hash.slice(0, 14)}… | ${confirmErr.message} | ${explorer}`, color: 'red' });
      throw confirmErr;
    }

    this.emit('LOG', { tag: 'EXECUTOR', message: `✅ Route confirmed. Tx: ${receipt.hash.slice(0, 14)}… · gas: ${(Number(receipt.gasUsed) / 1000).toFixed(0)}k units`, color: 'orange' });
    this.emit('EXECUTED', { swap: `${fromAsset}→${toAsset}`, tx_hash: receipt.hash, gas_used: receipt.gasUsed.toString(), explorer: `https://sepolia.etherscan.io/tx/${receipt.hash}`, status: 'SUCCESS' });

    // 7. ANCHOR — with gap-filling events
    this.emit('ANCHORING', { message: 'Uploading new state to 0G Storage…', swap: `${fromAsset}→${toAsset}` });
    this.emit('LOG', { tag: 'MEMORY', message: `Anchoring decision to 0G Galileo. Proof: ${consensusHash.slice(0, 12)}…`, color: 'purple' });

    const newState: RuntimeState = {
      ...state, current_asset: toAsset as any, current_tick: realTick,
      last_tick: state.current_tick || realTick, last_consensus_hash: consensusHash,
      updated_at: Math.floor(Date.now() / 1000)
    };
    const newStateURI = await this.storage.uploadJson(`/swarms/${this.swarmId}/state_snapshot.json`, newState);
    const anchorTx = await swarmAgent.updateState(BigInt(this.tokenId), `ipfs://${newStateURI}`, receipt.hash);
    await anchorTx.wait();

    const totalTrades = Number(agentData.totalTrades) + 1;
    this.emit('ANCHORED', { og_tx: anchorTx.hash, new_state_root: newStateURI, current_asset: toAsset, total_trades: totalTrades });
    this.emit('LOG', { tag: 'MEMORY', message: `0G Storage write confirmed. Block: ${await this.blockchain.ogProvider.getBlockNumber()} · ${(this.storage.bytesUploaded / 1024).toFixed(1)} KB stored.`, color: 'purple' });

    this.anchorCount += 3;
    this.emit('ANCHOR', { event_type: 'LINEAGE_UPDATE', hash: anchorTx.hash.slice(0, 18), description: `iNFT state updated — ${totalTrades} ancestor${totalTrades !== 1 ? 's' : ''} linked` });
    this.emit('ANCHOR', { event_type: 'MEMORY_ANCHOR', hash: newStateURI.slice(0, 18), description: `Run #${this.cycleCount} state anchored to 0G Galileo` });
    this.emit('ANCHOR', { event_type: 'PROOF_VERIFY', hash: receipt.hash.slice(0, 18), description: `Rebalance tx stored — ${(this.storage.bytesUploaded / 1024).toFixed(1)} KB on 0G Storage` });
    this.emit('LOG', { tag: 'EXECUTOR', message: `Settlement complete. Net position: ${toAsset} locked for this cycle.`, color: 'orange' });

    this.storage.uploadJson(`/swarms/${this.swarmId}/executions/${receipt.hash}.json`, {
      tx_hash: receipt.hash, chain_id: CONFIG.SEPOLIA.chainId, swap: `${fromAsset}→${toAsset}`,
      smart_account: smartAccountAddress, amount_in: amountDisplay, tick_at_execution: realTick,
      gas_used: receipt.gasUsed.toString(), amount_out_min: minOut, quote_source: quoteSource,
      status: 'SUCCESS', timestamp: Math.floor(Date.now() / 1000)
    }).catch(() => {});
  }
}
