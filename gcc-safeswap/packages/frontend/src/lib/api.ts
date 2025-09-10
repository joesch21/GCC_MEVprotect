import { log } from './logger.js';

const API = import.meta.env.VITE_API_BASE;
const API_BASE = API?.replace(/\/$/, "");

export async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method || "GET",
    mode: "cors",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

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

export async function oxQuote(params: Record<string,string>) {
  const qs = new URLSearchParams(params);
  const r = await fetch(`${API}/api/0x/quote?${qs}`, {
    mode: "cors",
    credentials: "omit"
  });
  const text = await r.text();
  log('0x ⇢', r.status, text.slice(0, 300));
  if (!r.ok) throw new Error(`0x ${r.status}: ${text}`);
  return JSON.parse(text);
}

export async function dexQuote(params: Record<string,string>) {
  const qs = new URLSearchParams(params);
  const r = await fetch(`${API}/api/dex/quote?${qs}`, {
    mode: "cors",
    credentials: "omit"
  });
  const text = await r.text();
  log('DEX ⇢', r.status, text.slice(0, 300));
  if (!r.ok) throw new Error(`DEX ${r.status}: ${text}`);
  return JSON.parse(text);
}
