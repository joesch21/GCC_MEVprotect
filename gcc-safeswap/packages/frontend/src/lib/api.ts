const BASE = import.meta.env.VITE_API_BASE.replace(/\/+$/,'');
export const api = (p: string) => `${BASE}/${p.replace(/^\/+/, '')}`;

type Opts = { timeoutMs?: number; signal?: AbortSignal };

export async function apiGet<T>(path: string, opts: Opts = {}): Promise<T> {
  const url = api(path);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: opts.signal ?? ctrl.signal,
      headers: { accept: 'application/json' },
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
