import 'dotenv/config';
import { agentCycle } from './agents/loop';
import { checkConsensus } from './agents/consensus';
import { SwarmStorage } from './storage/client';
import { NETWORKS } from './config/networks';

async function main() {
  const privateKey = process.env.PRIVATE_KEY!;
  const uniswapApiKey = process.env.UNISWAP_API_KEY!;
  const storage = new SwarmStorage(privateKey);

  console.log("--- Initializing State ---");
  const initialState = {
    pool: "ETH-USDC-V3",
    token0: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    token1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    amountIn: "1000000000000000000",
    current_price: "3485.12",
    updated_at: Math.floor(Date.now() / 1000)
  };

  const stateRoot = await storage.uploadJson(initialState);
  console.log(`State Root: ${stateRoot}`);

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
