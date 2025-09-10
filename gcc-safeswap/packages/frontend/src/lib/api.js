import { smartJoin } from "./http";
import { logInfo, logWarn, logError } from "./logger";

const BASE = import.meta.env.VITE_API_BASE;
export const api = (p) => smartJoin(BASE, p);

async function fetchJSON(url, init) {
  const started = new Date().toISOString();
  logInfo("HTTP →", { url, method: (init?.method || "GET"), body: init?.body ? JSON.parse(init.body) : undefined });
  try {
    const r = await fetch(url, init);
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    logInfo("HTTP ←", { url, status: r.status, ok: r.ok, json });
    if (!r.ok) {
      throw new Error(json?.error || `HTTP ${r.status}`);
    }
    return json;
  } catch (e) {
    logError("HTTP ✖", { url, error: String(e?.message || e) });
    throw e;
  }
}

export async function getQuote({ fromToken, toToken, amount, slippageBps }) {
  const url = smartJoin(BASE, "/api/quote");
  return await fetchJSON(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromToken, toToken,
      amount: String(amount),
      slippageBps: slippageBps ?? 300
    })
  });
}

export async function health() {
  const url = smartJoin(BASE, "/api/plugins/health");
  return await fetchJSON(url);
}

