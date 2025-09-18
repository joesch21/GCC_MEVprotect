import {
  loadCondorWallet,
  decodePngToPrivateKey,
  privateKeyToWallet,
} from "./condor";

/** Legacy name kept for callers that still import { loadEncoder } */
export async function loadEncoder(): Promise<any> {
  return loadCondorWallet();
}

/** Legacy alias for older code paths (expects File | ArrayBuffer | Uint8Array). */
export async function decodeFromPng(
  png: File | ArrayBuffer | Uint8Array,
  pass: string
): Promise<string> {
  // normalize to File | ArrayBuffer for the real helper
  if (png instanceof Uint8Array) {
    return decodePngToPrivateKey(
      png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
      pass
    );
  }
  return decodePngToPrivateKey(png as any, pass);
}

export { decodePngToPrivateKey, privateKeyToWallet };
