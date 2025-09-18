// packages/frontend/src/lib/condor/condor.ts
import { ethers } from "ethers";

type CondorExports = {
  // wasm-pack init
  default?: (opts?: { module_or_path: string } | string) => Promise<any> | any;

  // known decoders (names vary per build)
  decode_png?: (png: Uint8Array, pass: string) => any;
  decode_wallet_from_image?: (png: Uint8Array, pass: string) => any;
  wallet_from_image_with_password?: (png: Uint8Array, pass: string) => any;

  // sometimes present on mixed builds; we’ll probe it too
  wallet_from_key?: (png: Uint8Array, pass: string) => any;
};

let ready: Promise<CondorExports> | null = null;

// ABSOLUTE same-origin URLs (no remote hosts)
const JS_URL = new URL("/pkg/condor_encoder.js", location.origin).toString();
const WASM_URL = new URL("/pkg/condor_encoder_bg.wasm", location.origin).toString();

/* ---------------- helpers ---------------- */

function isHex(re: RegExp, s?: string): s is string {
  return !!s && re.test(s);
}

function norm0x64(s: string) {
  const k = s.startsWith("0x") ? s : `0x${s}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error("invalid key");
  return k;
}

/** Recursively search any return shape for a 64-hex private key and an address. */
function deepExtractKeyAndAddress(root: unknown): { key: string; address?: string } {
  const seen = new Set<any>();

  const tryFromString = (s: string) => {
    // try JSON first
    try {
      const j = JSON.parse(s);
      const r = deepExtractKeyAndAddress(j);
      if (r.key) return r;
    } catch {}
    // raw pattern scan
    const keyMatch = s.match(/0x?[0-9a-fA-F]{64}/);
    const addrMatch = s.match(/0x[0-9a-fA-F]{40}/);
    if (keyMatch) {
      return { key: norm0x64(keyMatch[0]), address: addrMatch?.[0] };
    }
    return { key: "" };
  };

  const walk = (v: any): { key: string; address?: string } => {
    if (v == null) return { key: "" };
    if (typeof v === "string") return tryFromString(v);
    if (typeof v === "number" || typeof v === "boolean") return { key: "" };
    if (Array.isArray(v)) {
      for (const el of v) {
        const r = walk(el);
        if (r.key) return r;
      }
      return { key: "" };
    }
    if (typeof v === "object") {
      if (seen.has(v)) return { key: "" };
      seen.add(v);

      // common fields first
      const key =
        v.key ?? v.private_key ?? v.priv ?? v.secret ?? v.sk ?? v.pk ?? v.PrivateKey ?? v.PRIVATE_KEY;
      const addr = v.address ?? v.addr ?? v.Address ?? v.ADDRESS;

      if (isHex(/^0x?[0-9a-fA-F]{64}$/, key)) {
        return { key: norm0x64(key), address: isHex(/^0x[0-9a-fA-F]{40}$/, addr) ? addr : undefined };
      }

      // otherwise recurse properties
      for (const val of Object.values(v)) {
        const r = walk(val);
        if (r.key) return r;
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
    // prefer object init to avoid the “deprecated parameters” warning
    if (typeof mod.default === "function") {
      await mod.default({ module_or_path: WASM_URL });
    }
    // small visibility for debugging without leaking secrets
    const keys = Object.keys(mod as any);
    console.info("[Condor] wasm exports available", {
      keys,
      functions: keys.filter((k) => typeof (mod as any)[k] === "function"),
    });
    return mod;
  })();
  return ready;
}

/* ---------------- public API ---------------- */

export async function decodePngToPrivateKey(png: File | ArrayBuffer, passphrase: string): Promise<string> {
  const mod = await loadCondorWallet();
  const bytes = png instanceof File ? new Uint8Array(await png.arrayBuffer()) : new Uint8Array(png);

  // try the most reliable order first
  const attempts: Array<{ fn: keyof CondorExports; args: any[] }> = [
    { fn: "decode_png", args: [bytes, passphrase] },
    { fn: "decode_wallet_from_image", args: [bytes, passphrase] },
    { fn: "wallet_from_image_with_password", args: [bytes, passphrase] },

    // some builds flip the order (will throw on wrong order — that’s OK)
    { fn: "wallet_from_image_with_password", args: [passphrase, bytes] },

    // rarely, wallet_from_key returns similar JSON in decoder builds
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
      // keep probing; log *which* path failed, but not values
      console.info("[Condor] decode attempt failed", {
        via: `${String(fn)}(${typeof args[0]}, ${typeof args[1]})`,
        error: e?.message ?? String(e),
      });
    }
  }

  throw new Error(
    "Decoder exports not recognized on this build (tried: decode_png, decode_wallet_from_image, wallet_from_image_with_password, wallet_from_key)"
  );
}

export function privateKeyToWallet(pk: string, provider: ethers.AbstractProvider): ethers.Wallet {
  const normalized = pk.startsWith("0x") ? pk : `0x${pk}`;
  // @ts-ignore v5/v6
  return new (ethers as any).Wallet(normalized, provider);
}
