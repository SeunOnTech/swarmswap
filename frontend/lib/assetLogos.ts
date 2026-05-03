/**
 * Central config for chain, token, and brand logo URLs (remote assets).
 * Update URLs here only — components use helpers below.
 */
export const CHAIN_LOGO_URLS: Record<string, string> = {
  Ethereum: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  Arbitrum: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png",
  Base: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
  Sepolia: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
};

export const TOKEN_LOGO_URLS: Record<string, string> = {
  ETH: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  WETH: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
  USDC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  ARB: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0x912CE59144191C1204E64559FE8253a0e49E6548/logo.png",
  cbBTC: "https://assets.coingecko.com/coins/images/40143/small/cbbtc.png",
};

/** Product / L2 / infra marks */
export const BRAND_LOGO_URLS = {
  /** 0G Galileo — swap for official CDN when available */
  zeroGGalileo:
    "https://chainscan-galileo.0g.ai/static/media/zg-logo-new.c67b64d9cc15bf617184b204e0db5c09.svg",
} as const;

export const PROTOCOL_LOGO_URLS = {
  uniswap: "https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png",
} as const;

export function getChainLogoUrl(chainLabel: string): string | undefined {
  const t = chainLabel.trim();
  if (CHAIN_LOGO_URLS[t]) return CHAIN_LOGO_URLS[t];
  if (/sepolia/i.test(t)) return CHAIN_LOGO_URLS.Sepolia;
  if (/ethereum\s*mainnet/i.test(t) || /^ethereum$/i.test(t)) return CHAIN_LOGO_URLS.Ethereum;
  if (/arbitrum/i.test(t)) return CHAIN_LOGO_URLS.Arbitrum;
  if (/^base$/i.test(t)) return CHAIN_LOGO_URLS.Base;
  return undefined;
}

/** Token symbol as shown in pool strings, e.g. WETH, USDC, cbBTC */
export function getTokenLogoUrl(symbol: string): string | undefined {
  const raw = symbol.trim();
  if (TOKEN_LOGO_URLS[raw]) return TOKEN_LOGO_URLS[raw];
  const up = raw.toUpperCase();
  if (TOKEN_LOGO_URLS[up]) return TOKEN_LOGO_URLS[up];
  if (up === "CBBTC") return TOKEN_LOGO_URLS.cbBTC;
  if (up === "ETH") return TOKEN_LOGO_URLS.ETH;
  return undefined;
}

export function parsePoolTokenSymbols(pool: string): string[] {
  return pool.split("/").map((s) => s.trim()).filter(Boolean);
}

/** Landing ticker / chip labels → logo URL */
export function getLogoForTickerName(name: string): string | undefined {
  const n = name.trim();
  if (/0g/i.test(n)) return BRAND_LOGO_URLS.zeroGGalileo;
  if (/sepolia/i.test(n)) return getChainLogoUrl("Sepolia");
  if (/^sepolia\s*eth$/i.test(n)) return getChainLogoUrl("Sepolia");
  return undefined;
}
