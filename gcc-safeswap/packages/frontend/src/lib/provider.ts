// packages/frontend/src/lib/provider.ts
import { ethers } from "ethers";

export function makeBscProvider(): ethers.JsonRpcProvider {
  const url = import.meta.env.VITE_BSC_RPC || "https://bsc-dataseed.binance.org";
  return new ethers.JsonRpcProvider(url, { name: "BSC", chainId: 56 });
}

export async function getMetamaskSigner(): Promise<ethers.Signer | null> {
  const anyWin = window as any;
  const eth = anyWin.ethereum;
  if (!eth) return null;
  await eth.request?.({ method: "eth_requestAccounts" });
  const provider = new ethers.BrowserProvider(eth);
  return await provider.getSigner();
}
