// packages/frontend/src/lib/condor/condor.ts
import { ethers } from "ethers";

/** ---------------- Types from the wasm bundle (loose on purpose) ---------------- */
type CondorWasm = {
  // wasm-pack init (varies by template)
  default?: (wasm?: string | { module_or_path: string }) => Promise<any> | any;

  // known decode variants across builds
  decode_png?: (png: Uint8Array, pass: string) => Promise<any> | any;
  wallet_from_image_with_password?: (png: Uint8Array, pass: string) => Promise<any> | any;
  decode_wallet_from_image?: (png: Uint8Array, pass: string) => Promise<any> | any;
  wallet_from_key?: (png: Uint8Array, pass: string) => Promise<any> | any;
};

let condorReady: Promise<CondorWasm> | null = null;

/** ---------------- Absolute same-origin URLs (no env, no remotes) ---------------- */
const JS_URL   = new URL("/pkg/condor_encoder.js", location.origin).toString();
const WASM_URL = new URL("/pkg/condor_encoder_bg.wasm", location.origin).toString();

/** Initialize and cache the wasm module. Supports multiple init signatures. */
export function loadCondorWallet(): Promise<CondorWasm> {
  if (condorReady) return condorReady;

  condorReady = (async () => {
    console.info("[Condor] loading wasm module", { jsUrl: JS_URL, wasmUrl: WASM_URL });

    // Dynamic import with cache-bust; prevent Vite prebundle
    const mod: any = await import(/* @vite-ignore */ `${JS_URL}?v=${Date.now()}`);

    // Support: default(wasmUrl) → default({ module_or_path }) → default()
    if (typeof mod.default === "function") {
      try {
        await mod.default(WASM_URL);
      } catch {
        try {
          await mod.default({ module_or_path: WASM_URL });
        } catch {
          // Some generated JS already knows its own wasm URL
          await mod.default();
        }
      }
    }

    return mod as CondorWasm;
  })();

  return condorReady;
}

/** ---------------- Small helpers ---------------- */
function ensure0x64(key: string): string {
  if (!key) throw new Error("Decode failed (empty key)");
  const k = key.startsWith("0x") ? key : `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error("Decode failed (invalid key)");
  return k;
}

function toBytes(input: File | ArrayBuffer | Uint8Array): Promise<Uint8Array> | Uint8Array {
  if (input instanceof Uint8Array) return input.slice(); // new buffer
  if (input instanceof File) return input.arrayBuffer().then((ab) => new Uint8Array(ab));
  // ArrayBuffer
  return new Uint8Array(input);
}

/** Decode a Condor PNG + passphrase → normalized hex private key (0x…) */
export async function decodePngToPrivateKey(
  png: File | ArrayBuffer | Uint8Array,
  passphrase: string
): Promise<string> {
  const mod = await loadCondorWallet();
  const bytes = await toBytes(png);

  // Try known export names in a stable order
  const candidates: Array<[string, any]> = [
    ["decode_png", (mod as any).decode_png],
    ["wallet_from_image_with_password", (mod as any).wallet_from_image_with_password],
    ["decode_wallet_from_image", (mod as any).decode_wallet_from_image],
    ["wallet_from_key", (mod as any).wallet_from_key],
  ];

  for (const [name, fn] of candidates) {
    if (typeof fn !== "function") continue;

    const raw = await fn(bytes, passphrase);
    const out = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});

    // Common field names across builds
    let key: string | undefined =
      out.key ?? out.private_key ?? out?.result?.key ?? out?.result?.private_key;

    if (!key && typeof out === "string") key = out; // (unlikely) bare string

    if (key) {
      return ensure0x64(key);
    }

    // Some decoders return an envelope – last resort scan for a 64-nybble hex
    const str = JSON.stringify(out);
    const m = str?.match(/"?(0x)?([0-9a-fA-F]{64})"?/);
    if (m?.[2]) {
      return ensure0x64(m[1] ? `${m[1]}${m[2]}` : `0x${m[2]}`);
    }

    throw new Error(`Decode via ${name} returned no key`);
  }

  // Helpful debug: list available exports if nothing matched
  try { console.warn("[Condor] wasm exports available:", Object.keys(mod as any)); } catch {}
  throw new Error(
    "Decoder exports not found (tried: decode_png, wallet_from_image_with_password, decode_wallet_from_image, wallet_from_key)"
  );
}

/** Build an ethers Wallet from a private key. Works with v5 or v6 providers. */
export function privateKeyToWallet(pk: string, provider: any): ethers.Wallet {
  const normalized = pk.startsWith("0x") ? pk : `0x${pk}`;
  // @ts-ignore — v5/v6 compatible
  return new (ethers as any).Wallet(normalized, provider);
}
