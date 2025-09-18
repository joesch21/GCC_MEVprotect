import { ethers } from "ethers";

type CondorExports = {
  default?: (opts?: { module_or_path: string } | string) => Promise<any> | any;
  decode_png?: (png: Uint8Array, pass: string) => any;
  decode_wallet_from_image?: (png: Uint8Array, pass: string) => any;
  wallet_from_image_with_password?: (png: Uint8Array, pass: string) => any;
  wallet_from_key?: (png: Uint8Array, pass: string) => any;
};

let ready: Promise<CondorExports> | null = null;
const JS_URL = new URL("/pkg/condor_encoder.js", location.origin).toString();
const WASM_URL = new URL("/pkg/condor_encoder_bg.wasm", location.origin).toString();

/* ---------------- helpers ---------------- */

const HEX64 = /^0x?[0-9a-fA-F]{64}$/;
const ADDR  = /^0x[0-9a-fA-F]{40}$/;

function toHex32(bytes: ArrayLike<number>): string {
  let s = "0x";
  for (let i = 0; i < bytes.length; i++) {
    const b = (bytes[i] as number) & 0xff;
    s += b.toString(16).padStart(2, "0");
  }
  if (!HEX64.test(s)) throw new Error("invalid 32-byte key");
  return s;
}
function isByteArray(v: any): v is Uint8Array | number[] {
  if (v instanceof Uint8Array) return true;
  return Array.isArray(v) && v.length > 0 && v.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
}
function norm0x64(s: string) {
  const k = s.startsWith("0x") ? s : `0x${s}`;
  if (!HEX64.test(k)) throw new Error("invalid key");
  return k;
}

/** Recursively find a private key (string or 32-byte array) and optional address. */
function deepExtractKeyAndAddress(root: unknown): { key: string; address?: string } {
  const seen = new Set<any>();

  const scanString = (s: string) => {
    try { const j = JSON.parse(s); const r = deepExtractKeyAndAddress(j); if (r.key) return r; } catch {}
    const keyMatch = s.match(/0x?[0-9a-fA-F]{64}/);
    const addrMatch = s.match(/0x[0-9a-fA-F]{40}/);
    if (keyMatch) return { key: norm0x64(keyMatch[0]), address: addrMatch?.[0] };
    return { key: "" };
  };

  const walk = (v: any): { key: string; address?: string } => {
    if (v == null) return { key: "" };

    if (typeof v === "string") return scanString(v);

    if (typeof v === "bigint") return { key: "" };
    if (typeof v === "number" || typeof v === "boolean") return { key: "" };

    if (isByteArray(v)) {
      if (v.length === 32) return { key: toHex32(v) };
      // not 32 bytes → keep scanning children if it’s an array
      if (Array.isArray(v)) {
        for (const el of v) { const r = walk(el); if (r.key) return r; }
      }
      return { key: "" };
    }

    if (Array.isArray(v)) {
      for (const el of v) { const r = walk(el); if (r.key) return r; }
      return { key: "" };
    }

    if (typeof v === "object") {
      if (seen.has(v)) return { key: "" };
      seen.add(v);

      // common wrappers
      if ("Ok" in v)  { const r = walk((v as any).Ok);  if (r.key) return r; }
      if ("ok" in v)  { const r = walk((v as any).ok);  if (r.key) return r; }
      if ("value" in v){ const r = walk((v as any).value); if (r.key) return r; }
      if ("result" in v){ const r = walk((v as any).result); if (r.key) return r; }

      // direct fields (string or bytes)
      const fields = [
        "key","private_key","priv","secret","sk","pk","PrivateKey","PRIVATE_KEY",
        "key_bytes","private_key_bytes","secret_key","seckey","privKey","privateKey"
      ];
      for (const f of fields) {
        const val = (v as any)[f];
        if (typeof val === "string" && HEX64.test(val)) return { key: norm0x64(val) };
        if (isByteArray(val) && val.length === 32) return { key: toHex32(val) };
      }

      // address (optional)
      const a = (v as any).address ?? (v as any).addr ?? (v as any).Address ?? (v as any).ADDRESS;
      const address = typeof a === "string" && ADDR.test(a) ? a : undefined;

      // recurse properties
      for (const val of Object.values(v)) {
        const r = walk(val);
        if (r.key) return { key: r.key, address: address ?? r.address };
      }
      return { key: "" };
    }

    return { key: "" };
  };

  const r = walk(root);
  if (!r.key) throw new Error("Decode returned object without a private key");
  return r;
}

/* ---------------- loader ---------------- */

export async function loadCondorWallet(): Promise<CondorExports> {
  if (ready) return ready;
  ready = (async () => {
    console.info("[Condor] loading wasm module", { jsUrl: JS_URL, wasmUrl: WASM_URL });
    const mod: CondorExports = await import(/* @vite-ignore */ `${JS_URL}?v=${Date.now()}`);
    if (typeof mod.default === "function") {
      await mod.default({ module_or_path: WASM_URL }); // avoids the deprecation warning
    }
    const keys = Object.keys(mod as any);
    console.info("[Condor] wasm exports available", {
      keys, functions: keys.filter(k => typeof (mod as any)[k] === "function"),
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
