// packages/frontend/src/lib/condor/condor.ts
import { ethers } from "ethers";

type CondorExports = {
  default?: (opts?: { module_or_path: string } | string) => Promise<any> | any;
  decode_png?: (png: Uint8Array, pass: string) => any;
  decode_wallet_from_image?: (png: Uint8Array, pass: string) => any;
  wallet_from_image_with_password?: (png: Uint8Array, pass: string) => any;
  wallet_from_key?: (png: Uint8Array, pass: string) => any;
};

// flip on in console: window.__CONDOR_DEBUG__ = true
declare global { interface Window { __CONDOR_DEBUG__?: boolean } }

let ready: Promise<CondorExports> | null = null;
const JS_URL   = new URL("/pkg/condor_encoder.js", location.origin).toString();
const WASM_URL = new URL("/pkg/condor_encoder_bg.wasm", location.origin).toString();

/* ---------------- helpers ---------------- */

const HEX64 = /^0x?[0-9a-fA-F]{64}$/;
const ADDR  = /^0x[0-9a-fA-F]{40}$/;
const B64_32_BYTES = /^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{2}==$/; // 32 bytes -> 44 chars (with ==)

const log = (...a: any[]) => window.__CONDOR_DEBUG__ && console.info(...a);

function toHex32(bytes: ArrayLike<number>): string {
  let s = "0x";
  for (let i = 0; i < bytes.length; i++) s += ((bytes[i] as number) & 0xff).toString(16).padStart(2, "0");
  if (!HEX64.test(s)) throw new Error("invalid 32-byte key");
  return s;
}

function isUint8(v: any): v is Uint8Array { return v instanceof Uint8Array; }
function isByteArray(v: any): v is Uint8Array | number[] { return isUint8(v) || (Array.isArray(v) && v.every(n => Number.isInteger(n) && n >= 0 && n <= 255)); }
function isArrayLike32(v: any): v is { length: number } {
  if (!v || typeof v !== "object") return false;
  if (typeof (v as any).length !== "number") return false;
  if ((v as any).length !== 32) return false;
  // has numeric indices? treat as array-like of bytes
  return [...Array(32).keys()].every(i => (i in v));
}

function maybeBase64ToHex(s: string): string | null {
  if (!B64_32_BYTES.test(s)) return null;
  try {
    const bin = atob(s);
    if (bin.length !== 32) return null;
    const arr = new Uint8Array(32);
    for (let i = 0; i < 32; i++) arr[i] = bin.charCodeAt(i) & 0xff;
    return toHex32(arr);
  } catch { return null; }
}

function norm0x64(s: string) {
  const k = s.startsWith("0x") ? s : `0x${s}`;
  if (!HEX64.test(k)) throw new Error("invalid key");
  return k;
}

/** Describe value without secrets (for debug) */
function shape(v: any): any {
  const t = typeof v;
  if (v == null || t !== "object") return { type: t };
  const ctor = (v as any)?.constructor?.name;
  const keys = Object.keys(v).slice(0, 12);
  const meta: Record<string, string> = {};
  for (const k of keys) {
    const val = (v as any)[k];
    meta[k] =
      isUint8(val) ? `Uint8Array(${val.length})` :
      Array.isArray(val) ? `Array(${val.length})` :
      typeof val;
  }
  return { type: t, ctor, keys, meta };
}

/** Recursively find a private key: hex string, base64 string, Uint8Array(32), or array-like[32]. */
function deepExtractKeyAndAddress(root: unknown): { key: string; address?: string } {
  const seen = new Set<any>();

  const scanString = (s: string) => {
    // 1) exact hex?
    if (HEX64.test(s)) return { key: norm0x64(s) };
    // 2) base64 32-bytes?
    const h = maybeBase64ToHex(s);
    if (h) return { key: h };
    // 3) JSON?
    try { const j = JSON.parse(s); const r = deepExtractKeyAndAddress(j); if (r.key) return r; } catch {}
    // 4) pattern search inside
    const keyMatch = s.match(/0x?[0-9a-fA-F]{64}/);
    const addrMatch = s.match(/0x[0-9a-fA-F]{40}/);
    if (keyMatch) return { key: norm0x64(keyMatch[0]), address: addrMatch?.[0] };
    return { key: "" };
  };

  const walk = (v: any): { key: string; address?: string } => {
    if (v == null) return { key: "" };

    if (typeof v === "string") return scanString(v);

    if (isByteArray(v)) {
      if (v.length === 32) return { key: toHex32(v) };
      return { key: "" };
    }
    if (isArrayLike32(v)) {
      // convert array-like {0:..,1:.., length:32}
      const arr = new Uint8Array(32);
      for (let i = 0; i < 32; i++) arr[i] = (v[i] ?? 0) & 0xff;
      return { key: toHex32(arr) };
    }

    if (Array.isArray(v)) {
      for (const el of v) { const r = walk(el); if (r.key) return r; }
      return { key: "" };
    }

    if (typeof v === "object") {
      if (seen.has(v)) return { key: "" };
      seen.add(v);

      // wrappers
      for (const w of ["Ok","ok","value","result"]) {
        if (w in v) { const r = walk((v as any)[w]); if (r.key) return r; }
      }

      // common fields (string/bytes/base64/array-like)
      const fields = [
        "key","private_key","priv","secret","sk","pk","PrivateKey","PRIVATE_KEY",
        "key_bytes","private_key_bytes","secret_key","privKey","privateKey"
      ];
      for (const f of fields) {
        const val = (v as any)[f];
        if (typeof val === "string") {
          if (HEX64.test(val)) return { key: norm0x64(val) };
          const h = maybeBase64ToHex(val); if (h) return { key: h };
        }
        if (isByteArray(val) && val.length === 32) return { key: toHex32(val) };
        if (isArrayLike32(val)) {
          const arr = new Uint8Array(32);
          for (let i = 0; i < 32; i++) arr[i] = (val[i] ?? 0) & 0xff;
          return { key: toHex32(arr) };
        }
      }

      const a = (v as any).address ?? (v as any).addr ?? (v as any).Address ?? (v as any).ADDRESS;
      const address = typeof a === "string" && ADDR.test(a) ? a : undefined;

      // recurse
      for (const val of Object.values(v)) {
        const r = walk(val);
        if (r.key) return { key: r.key, address: address ?? r.address };
      }
      return { key: "" };
    }

    return { key: "" };
  };

  const r = walk(root);
  if (!r.key) {
    log("[Condor] decode raw shape", shape(root));
    throw new Error("Decode returned object without a private key");
  }
  return r;
}

/* ---------------- loader ---------------- */

export async function loadCondorWallet(): Promise<CondorExports> {
  if (ready) return ready;
  ready = (async () => {
    console.info("[Condor] loading wasm module", { jsUrl: JS_URL, wasmUrl: WASM_URL });
    const mod: CondorExports = await import(/* @vite-ignore */ `${JS_URL}?v=${Date.now()}`);
    if (typeof mod.default === "function") {
      // avoid the deprecation warning by always using an object
      await mod.default({ module_or_path: WASM_URL });
    }
    const keys = Object.keys(mod as any);
    console.info("[Condor] wasm exports available", {
      keys,
      functions: keys.filter(k => typeof (mod as any)[k] === "function"),
    });
    return mod;
  })();
  return ready;
}

/* ---------------- public API ---------------- */

export async function decodePngToPrivateKey(png: File | ArrayBuffer, passphrase: string): Promise<string> {
  const mod = await loadCondorWallet();
  const bytes = png instanceof File ? new Uint8Array(await png.arrayBuffer()) : new Uint8Array(png);

  const attempts: Array<{ fn: keyof CondorExports; args: any[] }> = [
    { fn: "decode_png", args: [bytes, passphrase] },
    { fn: "decode_wallet_from_image", args: [bytes, passphrase] },
    { fn: "wallet_from_image_with_password", args: [bytes, passphrase] },
    { fn: "wallet_from_image_with_password", args: [passphrase, bytes] },
    { fn: "wallet_from_key", args: [bytes, passphrase] },
    { fn: "wallet_from_key", args: [passphrase, bytes] },
  ];

  for (const { fn, args } of attempts) {
    const f = (mod as any)[fn];
    if (typeof f !== "function") continue;
    try {
      const out = await f(...args);
      const { key } = deepExtractKeyAndAddress(out);
      console.info("[Condor] decode succeeded", { via: `${String(fn)}(${typeof args[0]}, ${typeof args[1]})` });
      return key;
    } catch (e: any) {
      console.info("[Condor] decode attempt failed", {
        via: `${String(fn)}(${typeof args[0]}, ${typeof args[1]})`,
        error: e?.message ?? String(e),
      });
    }
  }

  throw new Error("Decoder exports not recognized (tried decode_png / decode_wallet_from_image / wallet_from_image_with_password / wallet_from_key)");
}

export function privateKeyToWallet(pk: string, provider: ethers.AbstractProvider): ethers.Wallet {
  const normalized = pk.startsWith("0x") ? pk : `0x${pk}`;
  // @ts-ignore v5/v6
  return new (ethers as any).Wallet(normalized, provider);
}
