const BASE = import.meta.env.VITE_API_BASE.replace(/\/+$/, "");
export const api = (p) => `${BASE}/${p.replace(/^\/+/, "")}`;

export async function apiGet(path, opts = {}) {
  const url = api(path);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);

  try {
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal: opts.signal ?? ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0,120)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function getQuote({ fromToken, toToken, amountWei, slippageBps }) {
  const r = await fetch(`${BASE}/api/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromToken,
      toToken,
      amount: String(amountWei),
      slippageBps: slippageBps ?? 300,
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Quote failed ${r.status}: ${txt}`);
  }
  return r.json();
}

