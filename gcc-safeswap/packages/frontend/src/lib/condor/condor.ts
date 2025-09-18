// packages/frontend/src/lib/condor/condor.ts
import { ethers } from "ethers";

/* ---------------- logger bridge (to your Debug logs) ---------------- */
function uiLog(message: string, ctx?: Record<string, any>) {
  const line = ctx ? `${message} ${safeJson(ctx)}` : message;
  try { (window as any).addLog?.(line); } catch {}
  try { (window as any).log?.(line); } catch {}
  try { (window as any).__pushLog?.(line); } catch {}
  // eslint-disable-next-line no-console
  console.info(line);
}
function safeJson(x: any) { try { return JSON.stringify(x); } catch { return "[unserializable]"; } }

/* ---------------- loose wasm module typing ---------------- */
type CondorWasm = {
  default?: (wasm?: string | { module_or_path: string }) => Promise<any> | any;
  decode_png?: (png: Uint8Array, pass: string) => Promise<any> | any;
  wallet_from_image_with_password?: (png: Uint8Array, pass: string) => Promise<any> | any;
  decode_wallet_from_image?: (png: Uint8Array, pass: string) => Promise<any> | any;
  wallet_from_key?: (png: Uint8Array, pass: string) => Promise<any> | any;
  [k: string]: any;
};

let condorReady: Promise<CondorWasm> | null = null;

/* ---------------- absolute same-origin URLs ---------------- */
const JS_URL   = new URL("/pkg/condor_encoder.js", location.origin).toString();
const WASM_URL = new URL("/pkg/condor_encoder_bg.wasm", location.origin).toString();

/* ---------------- init + cache ---------------- */
export function loadCondorWallet(): Promise<CondorWasm> {
  if (condorReady) return condorReady;
  condorReady = (async () => {
    uiLog("[Condor] loading wasm module", { jsUrl: JS_URL, wasmUrl: WASM_URL });

    const mod: any = await import(/* @vite-ignore */ `${JS_URL}?v=${Date.now()}`);

    if (typeof mod.default === "function") {
      try { await mod.default(WASM_URL); }
      catch { try { await mod.default({ module_or_path: WASM_URL }); }
      catch { await mod.default(); } }
    }

    try {
      const keys = Object.keys(mod || {});
      const fnKeys = keys.filter((k) => typeof (mod as any)[k] === "function");
      uiLog("[Condor] wasm exports available", { keys, functions: fnKeys });
    } catch {}

    return mod as CondorWasm;
  })();
  return condorReady;
}

/* ---------------- helpers ---------------- */
function ensure0x64(key: string): string {
  if (!key) throw new Error("Decode failed (empty key)");
  const k = key.startsWith("0x") ? key : `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error("Decode failed (invalid key)");
  return k;
}

function toBytes(input: File | ArrayBuffer | Uint8Array): Promise<Uint8Array> | Uint8Array {
  if (input instanceof Uint8Array) return input.slice();
  if (input instanceof File) return input.arrayBuffer().then((ab) => new Uint8Array(ab));
  return new Uint8Array(input);
}

function safeParse(raw: any): any { if (typeof raw !== "string") return raw; try { return JSON.parse(raw); } catch { return raw; } }

function extractKey(out: any): string | null {
  if (!out) return null;
  let key: string | undefined =
    out.key ?? out.private_key ?? out?.result?.key ?? out?.result?.private_key;
  if (typeof out === "string") key = out;
  if (!key) {
    try {
      const s = JSON.stringify(out);
      const m = s.match(/"(0x)?([0-9a-fA-F]{64})"/);
      if (m?.[2]) key = m[1] ? `${m[1]}${m[2]}` : `0x${m[2]}`;
    } catch {}
  }
  return key ? ensure0x64(key) : null;
}

/* breadth-first discovery of function exports, including nested objects (depth 2) */
function discoverFns(root: any, depth = 2, prefix = "", seen = new Set<any>()): Array<[string, any]> {
  const out: Array<[string, any]> = [];
  if (!root || seen.has(root) || depth < 0) return out;
  seen.add(root);

  const entries = Object.entries(root);
  for (const [k, v] of entries) {
    const name = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "function") out.push([name, v]);
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...discoverFns(v, depth - 1, name, seen));
    }
  }
  return out;
}

/* try a candidate fn with both arg orders */
async function tryDecoder(fnName: string, fn: any, bytes: Uint8Array, pass: string): Promise<string | null> {
  if (typeof fn !== "function") return null;

  // Skip obvious non-decoders
  if (/^(default|initSync|__wbg_init)$/.test(fnName)) return null;

  // Only try names that look promising
  if (!/(decode|wallet|image|key)/i.test(fnName)) return null;

  // Attempt (bytes, pass) then (pass, bytes)
  const attempts: Array<[string, any[]]> = [
    [`${fnName}(bytes, pass)`, [bytes, pass]],
    [`${fnName}(pass, bytes)`, [pass, bytes]],
  ];

  for (const [label, args] of attempts) {
    try {
      const raw = await fn.apply(null, args);
      const out = safeParse(raw);
      const key = extractKey(out);
      if (key) {
        uiLog("[Condor] decode succeeded", { via: label });
        return key;
      }
      uiLog("[Condor] decode returned no key", { via: label, typeof: typeof raw });
    } catch (e: any) {
      // Verbose but helpful on first run
      uiLog("[Condor] decode attempt failed", { via: label, error: String(e?.message || e) });
    }
  }
  return null;
}

/* ---------------- public API ---------------- */
export async function decodePngToPrivateKey(
  png: File | ArrayBuffer | Uint8Array,
  passphrase: string
): Promise<string> {
  const mod = await loadCondorWallet();
  const bytes = await toBytes(png);

  // Known names first
  const known: Array<[string, any]> = [
    ["decode_png", mod.decode_png],
    ["wallet_from_image_with_password", mod.wallet_from_image_with_password],
    ["decode_wallet_from_image", mod.decode_wallet_from_image],
    ["wallet_from_key", mod.wallet_from_key],
  ];

  for (const [name, fn] of known) {
    const key = await tryDecoder(name, fn, bytes, passphrase);
    if (key) return key;
  }

  // Discovery (top-level + nested)
  const all = discoverFns(mod, 2);
  const tried = new Set(known.map(([n]) => n));
  const candidates = all
    .filter(([n]) => !tried.has(n))
    .filter(([n]) => /(decode|wallet|image|key)/i.test(n));

  if (candidates.length) {
    uiLog("[Condor] trying discovered decoder candidates", { candidates: candidates.map(([n]) => n) });
  }

  for (const [name, fn] of candidates) {
    const key = await tryDecoder(name, fn, bytes, passphrase);
    if (key) return key;
  }

  try {
    const fnKeys = all.map(([n]) => n);
    uiLog("[Condor] decoder exports not found", { tried: known.map(([n]) => n), discovered: fnKeys });
  } catch {}
  throw new Error(
    "Decoder exports not found (tried: decode_png, wallet_from_image_with_password, decode_wallet_from_image, wallet_from_key)"
  );
}

export function privateKeyToWallet(pk: string, provider: any): ethers.Wallet {
  const normalized = pk.startsWith("0x") ? pk : `0x${pk}`;
  // @ts-ignore v5/v6 compatible
  return new (ethers as any).Wallet(normalized, provider);
}
