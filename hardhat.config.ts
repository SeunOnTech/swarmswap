import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.35",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    "0g-galileo": {
      url: "https://evmrpc-testnet.0g.ai", 
      chainId: 16602,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    },
    "sepolia": {
      url: "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  },
  etherscan: {
    apiKey: { 
      "0g-galileo": "placeholder",
      "sepolia": process.env.ETHERSCAN_API_KEY || ""
    }, 
    customChains: [{
      network: "0g-galileo",
      chainId: 16602,
      urls: {
        apiURL: "https://chainscan-galileo.0g.ai/api",
        browserURL: "https://chainscan-galileo.0g.ai"
      }
    }]
  }
};

export default config;
