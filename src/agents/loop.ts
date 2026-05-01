import { SwarmStorage } from '../storage/client';
import { getUniswapQuote, executeSwap } from '../uniswap/router';
import { NETWORKS } from '../config/networks';
import { checkConsensus } from './consensus';
import { ethers } from 'ethers';

export async function agentCycle(
  agentRole: 'analyzer' | 'risk' | 'executor',
  privateKey: string,
  uniswapApiKey: string,
  stateRootHash: string
) {
  // 0G Signer (Coordination)
  const ogProvider = new ethers.JsonRpcProvider(NETWORKS.galileo.rpc);
  const ogSigner = new ethers.Wallet(privateKey, ogProvider);
  const storage = new SwarmStorage(privateKey);

  // Sepolia Signer (Execution)
  const sepoliaProvider = new ethers.JsonRpcProvider(NETWORKS.sepolia.rpc);
  const sepoliaSigner = new ethers.Wallet(privateKey, sepoliaProvider);

  console.log(`[${agentRole}] Starting cycle...`);

  // 1. Download current state from 0G Storage
  const state = await storage.downloadJson(stateRootHash);
  console.log(`[${agentRole}] Current state:`, state.pool);

  // 2. Get Uniswap quote for analysis (Sepolia Chain)
  const quote = await getUniswapQuote({
    tokenIn: state.token0,
    tokenOut: state.token1,
    amount: state.amountIn,
    chainId: NETWORKS.sepolia.chainId,
    swapper: sepoliaSigner.address
  }, uniswapApiKey);

  // 3. Generate role-based proposal
  const proposal = {
    agent_role: agentRole,
    timestamp: Math.floor(Date.now() / 1000),
    action: generateAction(agentRole, quote, state),
    confidence: 0.85,
    reasoning: `Analysis on Sepolia: Price Impact ${quote.quote.priceImpact}`,
    state_hash: stateRootHash
  };

  // 4. Upload proposal to 0G Storage
  const proposalHash = await storage.uploadJson(proposal);
  console.log(`[${agentRole}] Proposal uploaded: ${proposalHash}`);

  // 5. Executor logic: If consensus reached on 0G -> Execute on Sepolia
  if (agentRole === 'executor') {
      // In this demo flow, we assume proposals are passed in or fetched
      // For simplicity in the demo runner, we check consensus externally
  }
  
  return proposalHash;
}

function generateAction(role: string, quote: any, state: any): string {
  const priceImpact = parseFloat(quote.quote.priceImpact);
  if (role === 'risk') return priceImpact > 0.05 ? 'HOLD' : 'REBALANCE_NARROW';
  if (role === 'analyzer') return priceImpact < 0.02 ? 'REBALANCE_WIDE' : 'HOLD';
  return 'HOLD';
}
