// packages/frontend/src/lib/condor.ts
import { ethers } from "ethers";

type CondorWasm = {
  default: (opts: { module_or_path: string }) => Promise<any>;
  wallet_from_image_with_password: (pngBytes: Uint8Array, pass: string) => string | any;
  wallet_from_key?: (pngBytes: Uint8Array, pass: string) => any; // optional older export
};

let condorReady: Promise<CondorWasm> | null = null;

export function loadCondorWallet(): Promise<CondorWasm> {
  if (condorReady) return condorReady;

  const JS = import.meta.env.VITE_CONDOR_WALLET_JS_URL;   // e.g. https://trial-wallet.onrender.com/pkg/condor_wallet.js
  const WASM = import.meta.env.VITE_CONDOR_WALLET_WASM_URL; // e.g. https://trial-wallet.onrender.com/pkg/condor_wallet_bg.wasm
  if (!JS || !WASM) throw new Error("Condor wallet URLs not configured");

  condorReady = (async () => {
    const mod: any = await import(/* @vite-ignore */ JS);
    await mod.default({ module_or_path: WASM });
    return mod as CondorWasm;
  })();

  return condorReady;
}

export async function decodePngToPrivateKey(png: File | ArrayBuffer, passphrase: string): Promise<string> {
  const mod = await loadCondorWallet();
  const bytes = png instanceof File ? new Uint8Array(await png.arrayBuffer()) : new Uint8Array(png);
  const out = mod.wallet_from_image_with_password(bytes, passphrase);
  // trial-wallet returns JSON string with { key, address }
  const parsed = typeof out === "string" ? JSON.parse(out) : out;
  if (!parsed?.key) throw new Error("Decode failed (no key)");
  return "0x" + parsed.key.replace(/^0x/i, "");
}

export function privateKeyToWallet(pk: string, provider: ethers.AbstractProvider): ethers.Wallet {
  const normalized = pk.startsWith("0x") ? pk : `0x${pk}`;
  return new ethers.Wallet(normalized, provider);
}
