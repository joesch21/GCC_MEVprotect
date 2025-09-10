import { smartJoin } from "./http";

const BASE = import.meta.env.VITE_API_BASE;
export const api = (p) => smartJoin(BASE, p);

export async function getQuote({ fromToken, toToken, amountWei, slippageBps }) {
  const url = smartJoin(BASE, "/api/quote");
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromToken,
      toToken,
      amount: String(amountWei),
      slippageBps: slippageBps ?? 300
    })
  });
  if (!r.ok) throw new Error(`Quote failed ${r.status}`);
  return r.json();
}

export async function health() {
  const url = smartJoin(BASE, "/api/plugins/health");
  const r = await fetch(url);
  return r.ok;
}
