import { ethers } from "ethers";

type CondorExports = {
  default?: (opts?: { module_or_path: string } | string) => Promise<any> | any;
  decode_png?: (png: Uint8Array, pass: string) => any;
  decode_wallet_from_image?: (png: Uint8Array, pass: string) => any;
  wallet_from_image_with_password?: (png: Uint8Array, pass: string) => any;
  wallet_from_key?: (png: Uint8Array, pass: string) => any;
};

// enable verbose logs by running in console:  window.__CONDOR_DEBUG__ = true
declare global { interface Window { __CONDOR_DEBUG__?: boolean } }
const log = (...a: any[]) => window.__CONDOR_DEBUG__ && console.info(...a);

// ABSOLUTE same-origin URLs (no env, no remote origins)
const JS_URL   = new URL("/pkg/condor_encoder.js", location.origin).toString();
const WASM_URL = new URL("/pkg/condor_encoder_bg.wasm", location.origin).toString();

const HEX64 = /^0x?[0-9a-fA-F]{64}$/;
const ADDR  = /^0x[0-9a-fA-F]{40}$/;
const B64_32 = /^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{2}==$/; // 32 bytes -> 44 chars

let ready: Promise<CondorExports> | null = null;

/* ---------------- helpers (no global TypedArray needed) ---------------- */

function toHex32(bytes: ArrayLike<number>): string {
  let s = "0x";
  for (let i = 0; i < 32; i++) s += (bytes[i] & 0xff).toString(16).padStart(2, "0");
  if (!HEX64.test(s)) throw new Error("invalid 32-byte key");
  return s;
}

function maybeBase64ToHex(s: string): string | null {
  if (!B64_32.test(s)) return null;
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

function isView(v: any): v is ArrayBufferView {
  return v && typeof v === "object" && ArrayBuffer.isView(v);
}

/** Find a private key in common shapes (hex/base64/Uint8Array/array-likes/JSON). */
function deepExtractKeyAndAddress(root: unknown): { key: string; address?: string } {
  const seen = new Set<any>();

  const scanString = (s: string) => {
    if (HEX64.test(s)) return { key: norm0x64(s) };
    const h = maybeBase64ToHex(s); if (h) return { key: h };
    try { const j = JSON.parse(s); return deepExtractKeyAndAddress(j); }
    catch {
      const km = s.match(/0x?[0-9a-fA-F]{64}/);
      const am = s.match(/0x[0-9a-fA-F]{40}/);
      return km ? { key: norm0x64(km[0]), address: am?.[0] } : { key: "" };
    }
  };

  const walk = (v: any): { key: string; address?: string } => {
    if (v == null) return { key: "" };

    if (typeof v === "string") return scanString(v);

    if (isView(v) && v.byteLength === 32) {
      const u8 = new Uint8Array(v.buffer, v.byteOffset, 32);
      return { key: toHex32(u8) };
    }

    if (Array.isArray(v) && v.length === 32 && v.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
      const u8 = Uint8Array.from(v);
      return { key: toHex32(u8) };
    }

    if (Array.isArray(v)) {
      for (const el of v) { const r = walk(el); if (r.key) return r; }
      return { key: "" };
    }

    if (typeof v === "object") {
      if (seen.has(v)) return { key: "" };
      seen.add(v);

      // unwrap common wrappers
      for (const w of ["Ok","ok","value","result"]) {
        if (w in v) { const r = walk((v as any)[w]); if (r.key) return r; }
      }

      // common fields
      const fields = ["key","private_key","priv","privateKey","privKey","secret","sk","pk","key_bytes","private_key_bytes","secret_key"];
      for (const f of fields) {
        const x = (v as any)[f];
        if (typeof x === "string") {
          if (HEX64.test(x)) return { key: norm0x64(x) };
          const h = maybeBase64ToHex(x); if (h) return { key: h };
        }
        if (isView(x) && (x as ArrayBufferView).byteLength === 32) {
          const u8 = new Uint8Array((x as ArrayBufferView).buffer, (x as ArrayBufferView).byteOffset, 32);
          return { key: toHex32(u8) };
        }
        if (Array.isArray(x) && x.length === 32 && x.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
          const u8 = Uint8Array.from(x);
          return { key: toHex32(u8) };
        }
      }

      const a = (v as any).address ?? (v as any).addr;
      const address = typeof a === "string" && ADDR.test(a) ? a : undefined;

      for (const val of Object.values(v)) {
        const r = walk(val);
        if (r.key) return { key: r.key, address: address ?? r.address };
      }
    }
    return { key: "" };
  };

  const r = walk(root);
  if (!r.key) {
    log("[Condor] decode raw shape", { type: typeof root, keys: root && typeof root === "object" ? Object.keys(root as any) : [] });
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
      await mod.default({ module_or_path: WASM_URL }); // no deprecation warning
    }
    const keys = Object.keys(mod as any);
    console.info("[Condor] wasm exports available", { keys, functions: keys.filter(k => typeof (mod as any)[k] === "function") });
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
      console.info("[Condor] decode attempt failed", { via: `${String(fn)}(${typeof args[0]}, ${typeof args[1]})`, error: e?.message ?? String(e) });
    }
  }
  throw new Error("Decoder exports not recognized (tried decode_png / decode_wallet_from_image / wallet_from_image_with_password / wallet_from_key)");
}

export function privateKeyToWallet(pk: string, provider: ethers.AbstractProvider): ethers.Wallet {
  const normalized = pk.startsWith("0x") ? pk : `0x${pk}`;
  // @ts-ignore v5/v6
  return new (ethers as any).Wallet(normalized, provider);
}
