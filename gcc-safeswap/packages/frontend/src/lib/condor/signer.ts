import { ethers } from "ethers";

let _pk: string | null = null;

function ensure0x64(pk: string) {
  const s = pk.startsWith("0x") ? pk : `0x${pk}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(s)) throw new Error("Invalid private key");
  return s;
}

type ProviderLike =
  | string
  | ethers.providers.JsonRpcProvider        // v5 (optional)
  | ethers.JsonRpcProvider                  // v6
  | ethers.AbstractProvider;                // v6 base

function toProvider(p?: ProviderLike): any {
  if (!p) {
    const url = (import.meta as any)?.env?.VITE_BSC_RPC ?? "https://bscrpc.pancakeswap.finance";
    // @ts-ignore
    if (ethers?.providers?.JsonRpcProvider) return new (ethers as any).providers.JsonRpcProvider(url); // v5
    return new (ethers as any).JsonRpcProvider(url); // v6
  }
  if (typeof p === "string") {
    // @ts-ignore
    if (ethers?.providers?.JsonRpcProvider) return new (ethers as any).providers.JsonRpcProvider(p);
    return new (ethers as any).JsonRpcProvider(p);
  }
  return p;
}

/** Store the private key in-memory for this tab (session only). */
export function useCondorPrivateKey(pkHex: string) {
  _pk = ensure0x64(pkHex);
}

/** Forget the in-memory key. */
export function forgetCondorWallet() {
  _pk = null;
}

/** Get an ethers Wallet bound to a provider. Throws if no key set. */
export function getCondorWallet(providerLike?: ProviderLike): ethers.Wallet {
  if (!_pk) throw new Error("No Condor key loaded");
  const provider = toProvider(providerLike);
  // @ts-ignore v5/v6
  return new (ethers as any).Wallet(_pk, provider);
}
