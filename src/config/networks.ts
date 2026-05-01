export const NETWORKS = {
  galileo: {
    rpc: 'https://evmrpc-testnet.0g.ai',
    chainId: 16602,
    indexer: 'https://indexer-storage-testnet-turbo.0g.ai',
    agentContract: '0xBBd7a15F1b13856F213e82421Bc970228C369a3b'
  },
  sepolia: {
    rpc: 'https://rpc.sepolia.org',
    chainId: 11155111,
    universalRouter: '0x3bFA4761FB0C666d3699d9dC6f05806F1d2c1E63',
    tokens: {
      WETH: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
      USDC: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238'
    }
  }
};
