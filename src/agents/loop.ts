import { SwarmStorage } from '../storage/client';
import { getUniswapQuote } from '../uniswap/router';
import { NETWORKS } from '../config/networks';
import { ethers } from 'ethers';

export async function agentCycle(
  agentRole: 'analyzer' | 'risk' | 'executor',
  privateKey: string,
  uniswapApiKey: string,
  stateRootHash: string
) {
  const storage = new SwarmStorage(privateKey);
  const provider = new ethers.JsonRpcProvider(NETWORKS.galileo.rpc);
  const signer = new ethers.Wallet(privateKey, provider);

  console.log(`[${agentRole}] Starting cycle...`);

  // 1. Download current state from 0G
  const state = await storage.downloadJson(stateRootHash);
  console.log(`[${agentRole}] Current state:`, state.pool);

  // 2. Get Uniswap quote for analysis
  const quote = await getUniswapQuote({
    tokenIn: state.token0,
    tokenOut: state.token1,
    amount: state.amountIn,
    chainId: NETWORKS.galileo.chainId,
    swapper: signer.address
  }, uniswapApiKey);

  // 3. Generate role-based proposal
  const proposal = {
    agent_role: agentRole,
    timestamp: Math.floor(Date.now() / 1000),
    action: generateAction(agentRole, quote, state),
    confidence: 0.85,
    reasoning: `Analysis based on price impact: ${quote.quote.priceImpact}`,
    state_hash: stateRootHash
  };

  // 4. Upload proposal to 0G Storage
  const proposalHash = await storage.uploadJson(proposal);
  console.log(`[${agentRole}] Proposal uploaded: ${proposalHash}`);
  
  return proposalHash;
}

function generateAction(role: string, quote: any, state: any): string {
  const priceImpact = parseFloat(quote.quote.priceImpact);
  if (role === 'risk') return priceImpact > 0.05 ? 'HOLD' : 'REBALANCE_NARROW';
  if (role === 'analyzer') return priceImpact < 0.02 ? 'REBALANCE_WIDE' : 'HOLD';
  return 'HOLD';
}
