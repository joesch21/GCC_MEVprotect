- import { ethers } from "ethers";
- // old: always used window.ethereum signer

+ import { ethers } from "ethers";
+ import { getActiveSigner, useMetamask, activeSignerKind } from "./signer";

 export async function ensureSigner(): Promise<ethers.Signer> {
-  // old:
-  const provider = new ethers.BrowserProvider((window as any).ethereum);
-  return await provider.getSigner();
+  const existing = getActiveSigner();
+  if (existing) return existing;
+  const mm = await useMetamask();
+  if (mm) return mm;
+  throw new Error("No signer available (import a Condor key or connect MetaMask)");
 }

 export async function approveIfNeeded(token: string, spender: string, amountWei: string) {
   const signer = await ensureSigner();
   // ... unchanged approve logic ...
 }

 export async function swapExactTokensForTokens(params: { /* ... */ }) {
   const signer = await ensureSigner();
   // ... build and send tx with signer ...
 }
