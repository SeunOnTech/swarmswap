export const NETWORKS = {
  galileo: {
    rpc: 'https://evmrpc-testnet.0g.ai',
    chainId: 16602,
    indexer: 'https://indexer-storage-testnet-turbo.0g.ai',
    agentContract: '0x5D98795359D5b8c21559c554eD14Aa3585019e23'
  },
  sepolia: {
    rpc: 'https://sepolia.drpc.org',
    chainId: 11155111,
    universalRouter: '0x3bFA4761FB0C666d3699d9dC6f05806F1d2c1E63',
    tokens: {
      WETH: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
      USDC: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238'
    },
    uniswap: {
      router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // SwapRouter02 (Verified)
      universalRouter: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
      factory: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
      quoter: '0xEd4ef72B44d941863BfE381285B3D6c240503f64'
    }
  }
};
