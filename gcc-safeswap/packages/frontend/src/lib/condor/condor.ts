// packages/frontend/src/lib/condor/condor.ts
import { ethers } from "ethers";

type CondorWasm = {
  default?: (wasm?: string | { module_or_path: string }) => Promise<any>;
  wallet_from_image_with_password?: (png: Uint8Array, pass: string) => string | any;
  decode_png?: (png: Uint8Array, pass: string) =>
    { address: string; key: string } | Promise<{ address: string; key: string }>;
};

let condorReady: Promise<CondorWasm> | null = null;

// ABSOLUTE same-origin paths (no env, no external origins, no wallet names)
const JS_URL   = new URL("/pkg/condor_encoder.js", location.origin).toString();
const WASM_URL = new URL("/pkg/condor_encoder_bg.wasm", location.origin).toString();

export function loadCondorWallet(): Promise<CondorWasm> {
  if (condorReady) return condorReady;
  condorReady = (async () => {
    console.info("[Condor] loading wasm module", { jsUrl: JS_URL, wasmUrl: WASM_URL });
    const mod: any = await import(/* @vite-ignore */ `${JS_URL}?v=${Date.now()}`);
    if (typeof mod.default === "function") {
      try { await mod.default(WASM_URL); }
      catch { await mod.default({ module_or_path: WASM_URL }); }
    }
    return mod as CondorWasm;
  })();
  return condorReady;
}

export async function decodePngToPrivateKey(png: File | ArrayBuffer, pass: string): Promise<string> {
  const mod = await loadCondorWallet();
  const bytes = png instanceof File ? new Uint8Array(await png.arrayBuffer()) : new Uint8Array(png);

  if (typeof mod.decode_png === "function") {
    const out = await mod.decode_png(bytes, pass) as any;
    const key = out?.key ?? out?.private_key;
    if (!/^0x?[0-9a-fA-F]{64}$/.test(key || "")) throw new Error("Decode failed (invalid key)");
    return key.startsWith("0x") ? key : `0x${key}`;
  }
  if (typeof mod.wallet_from_image_with_password === "function") {
    const raw = mod.wallet_from_image_with_password(bytes, pass);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const key = parsed?.key ?? parsed?.private_key;
    if (!/^0x?[0-9a-fA-F]{64}$/.test(key || "")) throw new Error("Decode failed (invalid key)");
    return key.startsWith("0x") ? key : `0x${key}`;
  }
  throw new Error("Decoder exports not found (decode_png / wallet_from_image_with_password)");
}

export function privateKeyToWallet(pk: string, provider: ethers.AbstractProvider): ethers.Wallet {
  const normalized = pk.startsWith("0x") ? pk : `0x${pk}`;
  // @ts-ignore v5/v6 shim
  return new (ethers as any).Wallet(normalized, provider);
}
