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
  const volatility = await getVolatility();
  const action = generateAction(agentRole, quote, state, volatility);

  const proposal = {
    agent_role: agentRole,
    timestamp: Math.floor(Date.now() / 1000),
    action: action,
    confidence: 0.92,
    reasoning: `Analysis on Sepolia: Price Impact ${quote.quote.priceImpact}, Volatility ${volatility}`,
    state_hash: stateRootHash
  };

  // 4. Upload proposal to 0G Storage
  const proposalHash = await storage.uploadJson(proposal);
  console.log(`[${agentRole}] Proposal uploaded: ${proposalHash}`);

  // 5. Executor logic: If consensus reached on 0G -> Execute on Sepolia
  if (agentRole === 'executor') {
      const p1 = await storage.downloadJson(state.last_p1 || ""); // Simplified for demo
      const p2 = await storage.downloadJson(state.last_p2 || "");
      
      const consensusAction = await checkConsensus([p1, p2], privateKey);
      
      if (consensusAction && consensusAction !== 'HOLD') {
          console.log(`[executor] Consensus reached: ${consensusAction}. Executing on Sepolia...`);
          
          // Execute on Sepolia
          const txHash = await executeSwap(quote, sepoliaSigner);
          console.log(`[executor] Sepolia Tx Hash: ${txHash}`);
          
          // Anchor on 0G Galileo iNFT
          const agentContract = new ethers.Contract(
              NETWORKS.galileo.agentContract,
              ["function updateState(uint256 tokenId, string memory newStateURI, bytes32 executionTxHash) external"],
              ogSigner
          );
          
          // In a real flow, tokenId would be in state. Here we use 1 for demo
          const anchorTx = await agentContract.updateState(1, proposalHash, txHash);
          await anchorTx.wait();
          console.log(`[executor] Execution anchored on 0G Galileo!`);
      }
  }
  
  return proposalHash;
}

async function getVolatility(): Promise<number> {
  // Simulating an Oracle fetch (e.g. Pyth or Chainlink)
  // For the demo, we return a value that triggers our rebalance logic
  return 75; // 0-100 scale, >70 is "High Volatility"
}

function generateAction(role: string, quote: any, state: any, volatility: number): string {
  const priceImpact = parseFloat(quote.quote.priceImpact);
  
  // High Volatility -> Consensus on NARROW rebalance
  if (volatility > 70) return 'REBALANCE_NARROW';

  // Normal Volatility -> Role-based logic
  if (role === 'risk') {
      return priceImpact > 0.05 ? 'HOLD' : 'REBALANCE_WIDE';
  }
  
  if (role === 'analyzer') {
      if (priceImpact < 0.1) return 'REBALANCE_WIDE';
      return 'HOLD';
  }
  
  return 'HOLD';
}
