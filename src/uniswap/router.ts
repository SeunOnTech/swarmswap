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
}

export async function executeSwap(quote: any, signer: ethers.Wallet) {
  const universalRouterAddress = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD';
  
  const tx = await signer.sendTransaction({
    to: universalRouterAddress,
    data: quote.methodParameters.calldata,
    value: quote.methodParameters.value,
  });
  
  return tx.hash;
}
