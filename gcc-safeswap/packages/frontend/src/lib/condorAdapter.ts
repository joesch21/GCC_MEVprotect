import type { Eip1193 } from "../types/condor";

export function getCondor(): Eip1193 | null {
  const w: any = window;
  if (w.condor?.isCondor) return w.condor;
  if (w.ethereum?.isCondor) return w.ethereum;
  const arr = w.ethereum?.providers;
  if (Array.isArray(arr)) return arr.find((p: any) => p?.isCondor) || null;
  return null;
}

export async function condorConnect(): Promise<string> {
  const c = getCondor();
  if (!c) throw new Error("Condor provider not found");
  const accs = await c.request({ method: "eth_requestAccounts" });
  if (!accs?.length) throw new Error("No Condor accounts");
  return accs[0];
}

export async function condorSignRawTx(unsignedTx: any): Promise<string> {
  const c = getCondor();
  if (!c) throw new Error("Condor provider not found");
  let raw = await c.request({ method: "eth_signTransaction", params: [unsignedTx] }).catch(() => null);
  if (!raw) raw = await c.request({ method: "wallet_signTransaction", params: [unsignedTx] });
  if (!/^0x[0-9a-fA-F]+$/.test(raw)) throw new Error("Condor returned non-raw tx");
  return raw;
}
