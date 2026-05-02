import { ethers } from 'ethers';
import { NETWORKS } from '../config/networks';

const UNISWAP_API_URL = 'https://trade-api.gateway.uniswap.org/v1/quote';
const Q96 = 2n ** 96n;

// Verified ABIs
const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
  'function token0() view returns (address)',
  'function token1() view returns (address)'
];
const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
];
const SWAP_ROUTER_02_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
];

// Singleton Provider for Sepolia
let _sepoliaProvider: ethers.JsonRpcProvider | null = null;
function getSepoliaProvider() {
    if (!_sepoliaProvider) {
        _sepoliaProvider = new ethers.JsonRpcProvider(NETWORKS.sepolia.rpc, { chainId: 11155111, name: 'sepolia' }, { 
            staticNetwork: true,
        });
    }
    return _sepoliaProvider;
}

async function callWithRetry<T>(fn: () => Promise<T>, attempts = 3, delay = 1500): Promise<T> {
    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (e: any) {
            lastErr = e;
            const msg = e.message.toLowerCase();
            if (msg.includes('timeout') || msg.includes('522') || msg.includes('429')) {
                console.log(`[RPC] Retry ${i+1}/${attempts} due to ${msg}...`);
                await new Promise(r => setTimeout(r, delay * (i + 1)));
                continue;
            }
            throw e;
        }
    }
    throw lastErr;
}

export interface QuoteRequest {
  tokenIn: string;
  tokenOut: string;
  amount: string;
  chainId: number;
  swapper: string;
  slippageTolerance?: number;
}

export async function getUniswapQuote(req: QuoteRequest, apiKey: string) {
  try {
    const res = await fetch(UNISWAP_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        type: 'EXACT_INPUT',
        amount: req.amount,
        tokenInChainId: req.chainId,
        tokenOutChainId: req.chainId,
        tokenIn: req.tokenIn,
        tokenOut: req.tokenOut,
        swapper: req.swapper,
        routingPreference: 'BEST_PRICE',
        protocols: ['V3']
      })
    });

    const data = await res.json();
    
    if (req.chainId === 11155111) {
        const manual = await generateManualCalldata(req);
        return {
            quote: { 
                amountOut: manual.amountOut, 
                priceImpact: "0.01" 
            },
            methodParameters: {
                calldata: manual.calldata,
                value: '0'
            }
        };
    }
    return data;
  } catch (e) {
    if (req.chainId === 11155111) {
        const manual = await generateManualCalldata(req);
        return {
            quote: { amountOut: manual.amountOut, priceImpact: "0.01" },
            methodParameters: { calldata: manual.calldata, value: '0' }
        };
    }
    throw e;
  }
}

async function generateManualCalldata(req: QuoteRequest) {
    const provider = getSepoliaProvider();
    
    const factory = new ethers.Contract(NETWORKS.sepolia.uniswap.factory!, FACTORY_ABI, provider);
    const poolAddress = await callWithRetry(() => factory.getPool(req.tokenIn, req.tokenOut, 3000));
    
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const [slot0, token0] = await Promise.all([
        callWithRetry(() => pool.slot0()),
        callWithRetry(() => pool.token0())
    ]);

    const sqrtPriceX96 = BigInt(slot0.sqrtPriceX96);
    const amountIn = BigInt(req.amount);
    const zeroForOne = req.tokenIn.toLowerCase() === token0.toLowerCase();
    
    let amountOut: bigint;
    const Q96 = 2n ** 96n;
    if (zeroForOne) {
        // TokenIn is Token0, TokenOut is Token1
        // amountOut = (amountIn * sqrtPriceX96^2) / Q96^2
        amountOut = (amountIn * sqrtPriceX96 * sqrtPriceX96) / (Q96 * Q96);
    } else {
        // TokenIn is Token1, TokenOut is Token0
        // amountOut = (amountIn * Q96^2) / sqrtPriceX96^2
        amountOut = (amountIn * Q96 * Q96) / (sqrtPriceX96 * sqrtPriceX96);
    }

    const amountOutMinimum = (amountOut * 950n) / 1000n; // 5% slippage for demo stability

    const iface = new ethers.Interface(SWAP_ROUTER_02_ABI);
    const calldata = iface.encodeFunctionData('exactInputSingle', [{
        tokenIn: req.tokenIn,
        tokenOut: req.tokenOut,
        fee: 3000,
        recipient: req.swapper,
        deadline: Math.floor(Date.now() / 1000) + 1200,
        amountIn: amountIn,
        amountOutMinimum: amountOutMinimum,
        sqrtPriceLimitX96: 0
    }]);

    return {
        calldata,
        amountOut: amountOut.toString(),
        amountOutMinimum: amountOutMinimum.toString()
    };
}

export async function executeSwap(quote: any, signer: ethers.Wallet) {
  const routerAddress = NETWORKS.sepolia.uniswap.router!;
  
  if (!quote.methodParameters) throw new Error("No execution calldata available");

  const tx = await signer.sendTransaction({
    to: routerAddress,
    data: quote.methodParameters.calldata,
    value: quote.methodParameters.value || '0',
    gasLimit: 300000 
  });
  
  return tx.hash;
}
