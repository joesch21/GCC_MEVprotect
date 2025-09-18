// packages/frontend/src/lib/condor/encoder.ts
import { ethers } from "ethers";
import {
  loadCondorWallet,
  decodePngToPrivateKey,
  privateKeyToWallet,
} from "./condor";

export { privateKeyToWallet };

/** Legacy name that now wraps the new loader. Optional base argument ignored. */
export async function loadEncoder(_base?: string) {
  return await loadCondorWallet();
}

/** Legacy helper: return { address, key } from PNG+pass. */
export async function decodeFromPng(
  png: Uint8Array | ArrayBuffer | File,
  pass: string
): Promise<{ address: string; key: string }> {
  // Always produce a *real* ArrayBuffer (not SharedArrayBuffer)
  let ab: ArrayBuffer;

  if (png instanceof Uint8Array) {
    // slice() creates a new Uint8Array with its own ArrayBuffer
    ab = png.slice().buffer;
  } else if (png instanceof File) {
    ab = await png.arrayBuffer();
  } else {
    // png is already an ArrayBuffer
    ab = png as ArrayBuffer;
  }

  const key = await decodePngToPrivateKey(ab, pass);
  // derive address locally (no provider needed)
  // @ts-ignore ethers v5/v6 compatible
  const wallet = new (ethers as any).Wallet(key);
  return { address: wallet.address, key };
}
