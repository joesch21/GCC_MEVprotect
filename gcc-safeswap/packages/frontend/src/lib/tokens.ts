export const CHAIN_BSC = 56;

export const TOKENS = {
  BNB: {
    symbol: "BNB",
    address: "native",
    chainId: CHAIN_BSC,
    decimals: 18,
    isNative: true,
  },
  WBNB: {
    symbol: "WBNB",
    address: import.meta.env.VITE_TOKEN_WBNB,
    chainId: CHAIN_BSC,
    decimals: 18,
    hidden: true,
  },
  GCC: {
    symbol: "GCC",
    address: import.meta.env.VITE_TOKEN_GCC,
    chainId: CHAIN_BSC,
    decimals: 18,
  },
} as const;

export function uiToQuoteAddress(symbol: string): string {
  if (symbol === "BNB") return TOKENS.WBNB.address;
  return TOKENS[symbol as keyof typeof TOKENS]?.address || "";
}

export function visibleTokens() {
  return Object.values(TOKENS).filter(t => !t.hidden);
}
