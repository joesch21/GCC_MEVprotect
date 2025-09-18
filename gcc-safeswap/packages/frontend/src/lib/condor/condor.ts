// packages/frontend/src/lib/condor/condor.ts
import { ethers } from "ethers";

type CondorWasm = {
  default?: (wasm?: string | { module_or_path: string }) => Promise<any>;
  wallet_from_image_with_password?: (pngBytes: Uint8Array, pass: string) => string | any;
  decode_png?: (pngBytes: Uint8Array, pass: string) =>
    { address: string; key: string } | Promise<{ address: string; key: string }>;
};

let condorReady: Promise<CondorWasm> | null = null;

function normalizeLocal(url?: string): { js: string; wasm: string } {
  // Prefer same-origin encoder files
  const envJs = (import.meta as any)?.env?.VITE_CONDOR_WALLET_JS_URL as string | undefined;
  const envWasm = (import.meta as any)?.env?.VITE_CONDOR_WALLET_WASM_URL as string | undefined;

  // Helper to sanitize any provided path
  const fix = (p?: string, fallback = "") => {
    if (!p) return fallback;
    // Block external origins
    if (/^https?:\/\//i.test(p)) {
      console.warn("[Condor] Ignoring external wasm/js origin:", p);
      return fallback;
    }
    // Rewrite old wallet filenames to encoder filenames
    p = p.replace(/condor_wallet\.js$/i, "condor_encoder.js");
    p = p.replace(/condor_wallet_bg\.wasm$/i, "condor_encoder_bg.wasm");
    return p;
  };

  const js = fix(envJs, "/pkg/condor_encoder.js");
  const wasm = fix(envWasm, "/pkg/condor_encoder_bg.wasm");
  return { js, wasm };
}

export function loadCondorWallet(): Promise<CondorWasm> {
  if (condorReady) return condorReady;

  condorReady = (async () => {
    const { js, wasm } = normalizeLocal();
    console.info("[Condor] loading wasm module", { jsUrl: js, wasmUrl: wasm });

    // Dynamic ESM import (avoid Vite prebundle)
    const mod: any = await import(/* @vite-ignore */ `${js}?v=${Date.now()}`);

    // wasm-pack init supports both signatures
    if (typeof mod.default === "function") {
      try {
        await mod.default(wasm);
      } catch {
        await mod.default({ module_or_path: wasm });
      }
    }
    return mod as CondorWasm;
  })();

  return condorReady;
}

export async function decodePngToPrivateKey(
  png: File | ArrayBuffer,
  passphrase: string
): Promise<string> {
  const mod = await loadCondorWallet();
  const bytes = png instanceof File ? new Uint8Array(await png.arrayBuffer()) : new Uint8Array(png);

  // Try both common exports
  if (typeof mod.decode_png === "function") {
    const out = await mod.decode_png(bytes, passphrase) as any;
    const key = out?.key ?? out?.private_key;
    if (!/^0x?[0-9a-fA-F]{64}$/.test(key || "")) throw new Error("Decode failed (invalid key)");
    return key.startsWith("0x") ? key : `0x${key}`;
  }

  if (typeof mod.wallet_from_image_with_password === "function") {
    const raw = mod.wallet_from_image_with_password(bytes, passphrase);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const key = parsed?.key ?? parsed?.private_key;
    if (!/^0x?[0-9a-fA-F]{64}$/.test(key || "")) throw new Error("Decode failed (invalid key)");
    return key.startsWith("0x") ? key : `0x${key}`;
  }

  throw new Error("Decoder exports not found (decode_png / wallet_from_image_with_password)");
}

export function privateKeyToWallet(pk: string, provider: ethers.AbstractProvider): ethers.Wallet {
  const normalized = pk.startsWith("0x") ? pk : `0x${pk}`;
  // @ts-ignore allow v5/v6
  return new (ethers as any).Wallet(normalized, provider);
}
