import { Interface } from 'ethers';
import { type Address, type Hex } from 'viem';
import { CONFIG, SWAP_ROUTER_ABI } from '../config/constants';

export class SwapService {
  async getUniswapAPIQuote(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    swapper: Address
  ): Promise<{ calldata: Hex; to: Address; value: bigint; amountOut: string } | null> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (process.env.UNISWAP_API_KEY) headers['x-api-key'] = process.env.UNISWAP_API_KEY;

      const res = await fetch(`${CONFIG.UNISWAP_API_BASE}/quote`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'EXACT_INPUT',
          tokenInChainId: CONFIG.SEPOLIA.chainId,
          tokenOutChainId: CONFIG.SEPOLIA.chainId,
          tokenIn,
          tokenOut,
          amount: amountIn.toString(),
          swapper,
          slippageTolerance: CONFIG.SLIPPAGE_BPS / 100
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) {
        return null;
      }

      const data: any = await res.json();
      const quote = data.quote ?? data;
      if (!quote?.methodParameters) return null;

      return {
        calldata: quote.methodParameters.calldata as Hex,
        to: quote.methodParameters.to as Address,
        value: BigInt(quote.methodParameters.value ?? '0x0'),
        amountOut: quote.output?.amount ?? quote.outputAmount ?? '0'
      };
    } catch (err) {
      return null;
    }
  }

  async generateFallbackCalldata(
    tokenIn: { address: Address; decimals: number },
    tokenOut: { address: Address; decimals: number },
    amountIn: bigint,
    recipient: Address,
    feeTier: number = 3000
  ): Promise<{ calldata: Hex; router: Address; minOut: bigint }> {
    const iface = new Interface(SWAP_ROUTER_ABI);
    const amountOutMinimum = 0n;
    const calldata = iface.encodeFunctionData('exactInputSingle', [{
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      fee: feeTier,
      recipient,
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0n
    }]) as Hex;

    return { calldata, router: CONFIG.CONTRACTS.SEPOLIA.SWAP_ROUTER_02, minOut: amountOutMinimum };
  }
}
