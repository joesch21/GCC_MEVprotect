import { loadCondorWallet, decodePngToPrivateKey, privateKeyToWallet } from "./condor";

/** Legacy name kept for callers that still import { loadEncoder } */
export async function loadEncoder(): Promise<any> {
  return loadCondorWallet();
}

export { decodePngToPrivateKey, privateKeyToWallet };
