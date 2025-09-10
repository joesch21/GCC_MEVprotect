const API_BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, "");

type Opts = { timeoutMs?: number; signal?: AbortSignal };

export async function apiGet<T>(path: string, opts: Opts = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);

  try {
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal: opts.signal ?? ctrl.signal,
      headers: { "accept": "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0,120)}`);
    }
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiGetRetry<T>(path: string, tries = 2): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try { return await apiGet<T>(path); }
    catch (e) { last = e; await new Promise(r => setTimeout(r, 300 + i*400)); }
  }
  throw last;
}
