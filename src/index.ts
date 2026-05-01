import 'dotenv/config';
import { agentCycle } from './agents/loop';
import { checkConsensus } from './agents/consensus';
import { SwarmStorage } from './storage/client';
import { NETWORKS } from './config/networks';

async function main() {
  const privateKey = process.env.PRIVATE_KEY!;
  const uniswapApiKey = process.env.UNISWAP_API_KEY!;
  const storage = new SwarmStorage(privateKey);

  console.log("--- Initializing Swarm State on 0G ---");
  const initialState = {
    pool: "ETH-USDC-V3 (Sepolia)",
    token0: NETWORKS.sepolia.tokens.WETH,
    token1: NETWORKS.sepolia.tokens.USDC,
    amountIn: "1000000000000000000", // 1 ETH
    current_price: "3485.12",
    updated_at: Math.floor(Date.now() / 1000)
  };

  const stateRoot = await storage.uploadJson(initialState);
  console.log(`Initial State Root Hash: ${stateRoot}`);

  console.log("\n--- Running Agent Swarm ---");
  const p1 = await agentCycle('analyzer', privateKey, uniswapApiKey, stateRoot);
  const p2 = await agentCycle('risk', privateKey, uniswapApiKey, stateRoot);

  console.log("\n--- Consensus ---");
  const action = await checkConsensus([p1, p2], privateKey);
  
  if (action) {
    console.log(`Action Approved: ${action}`);
  } else {
    console.log("No Consensus.");
  }
}

main().catch(console.error);
