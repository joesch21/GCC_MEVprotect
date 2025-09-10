import { smartJoin } from "./http";

const BASE = import.meta.env.VITE_API_BASE;
export const api = (p) => smartJoin(BASE, p);

export async function getQuote({ fromToken, toToken, amount, slippageBps }) {
  // amount can be human ("1") or raw; backend will scale using on-chain decimals
  const url = smartJoin(BASE, "/api/quote");
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromToken,      // "GCC" | "BNB" | 0x-address
      toToken,        // "BNB" | 0x-address
      amount: String(amount),
      slippageBps: slippageBps ?? 300
    })
  });
  if (!r.ok) throw new Error(`Quote failed ${r.status}`);
  return r.json();
}
