import { ethers } from 'ethers';

const UNISWAP_API_URL = 'https://trade-api.gateway.uniswap.org/v1/quote';

export interface QuoteRequest {
  tokenIn: string;
  tokenOut: string;
  amount: string;
  chainId: number;
  swapper: string;
  slippageTolerance?: number;
}

export async function getUniswapQuote(req: QuoteRequest, apiKey: string) {
  const body = {
    type: 'EXACT_INPUT',
    amount: req.amount,
    tokenInChainId: req.chainId,
    tokenOutChainId: req.chainId,
    tokenIn: req.tokenIn,
    tokenOut: req.tokenOut,
    swapper: req.swapper,
    slippageTolerance: req.slippageTolerance ?? 0.5,
    routingPreference: 'BEST_PRICE',
    protocols: ['V3']
  };

  try {
    const res = await fetch(UNISWAP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-universal-router-version': '2.0'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Uniswap API ${res.status}: ${error}`);
    }

    return await res.json();
  } catch (e) {
    if (req.chainId === 16602) {
      console.warn("[Uniswap] Chain 16602 not supported by API. Using Mock Quote for demo.");
      return {
        quote: {
          amountOut: (BigInt(req.amount) * 3500n).toString(),
          priceImpact: "0.015",
          gasEstimate: "150000"
        },
        routingPreference: 'BEST_PRICE'
      };
    }
    throw e;
  }
}

export async function executeSwap(quote: any, signer: ethers.Wallet) {
  const universalRouterAddress = '0x3bFA4761FB0C666d3699d9dC6f05806F1d2c1E63';
  
  const tx = await signer.sendTransaction({
    to: universalRouterAddress,
    data: quote.methodParameters.calldata,
    value: quote.methodParameters.value,
  });
  
  return tx.hash;
}
