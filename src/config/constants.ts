import { Address, Hex } from 'viem';

export const CONFIG = {
  SEPOLIA: { chainId: 11155111, name: 'Sepolia' },
  OG_GALILEO: { chainId: 16602, name: '0G Galileo' },
  MAINNET: { chainId: 1, name: 'Ethereum Mainnet' },
  CONTRACTS: {
    SWARM_AGENT: '0x5D98795359D5b8c21559c554eD14Aa3585019e23' as Address,
    SEPOLIA: {
      SWAP_ROUTER_02: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E' as Address,
      FACTORY: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c' as Address
    },
    MAINNET: {
      WETH_USDC_POOL: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640' as Address
    }
  },
  TOKENS: {
    WETH: { address: (process.env.WETH_SEPOLIA || '0xfff9976782d46cc05630d1f6ebab18b2324d6b14') as Address, decimals: 18, symbol: 'WETH' },
    USDC: { address: (process.env.USDC_SEPOLIA || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238') as Address, decimals: 6, symbol: 'USDC' }
  },
  SLIPPAGE_BPS: 50,
  POLL_INTERVAL_MS: 15000,
  ACTION_PERMISSION: '0x7857abcd',
  TICK_REBALANCE_THRESHOLD: 1,
  TICK_IL_THRESHOLD: 1,
  UNISWAP_API_BASE: 'https://trade-api.gateway.uniswap.org/v1',
  OG_INDEXER_URL: 'https://indexer-storage-testnet-turbo.0g.ai',
  SWAP_ROUTER_EXACT_INPUT_SINGLE_SELECTOR: '0x04e45aaf' as Hex,
  SMART_ACCOUNTS_VERSION: '1.3.0',
  HYBRID_DEPLOY_SALT: '0x' as Hex,
  // 0G Compute — Qwen 2.5 7B Instruct (testnet)
  OG_COMPUTE_PROVIDER: '0xa48f01287233509FD694a22Bf840225062E67836' as Address
} as const;

/** Resync on boot: omit ALLOWED_AGENT_IDS or set * = all agents; comma-separated IDs = restrict (e.g. 5,6). */
export function allowedAgentsFilter(): number[] | null {
  const raw = process.env.ALLOWED_AGENT_IDS?.trim();
  if (raw === undefined || raw === '' || raw === '*') return null;
  const nums = raw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
  return nums.length > 0 ? nums : null;
}

export const ERC20_ABI = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)'
];

export const SWARM_AGENT_ABI = [
  'function mintAgent(address to, string memory configURI, string memory stateURI, address royaltyReceiver, uint96 royaltyBPS) external returns (uint256)',
  'function updateState(uint256 tokenId, string memory newStateURI, bytes32 executionTxHash) external',
  'function hasPermission(uint256 tokenId, address executor, bytes4 action) external view returns (bool)',
  'function totalAgents() external view returns (uint256)',
  'function agents(uint256 tokenId) external view returns (string configURI, string stateURI, uint256 totalTrades, uint256 lastRebalance)'
];

export const SWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)'
];

export const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
];
