import type { Eip1193 } from "../types/condor";

export function getCondor(): Eip1193 | null {
  const w: any = window;
  if (w.condor?.isCondor) return w.condor;
  if (w.ethereum?.isCondor) return w.ethereum;
  const arr = w.ethereum?.providers;
  if (Array.isArray(arr)) return arr.find((p: any) => p?.isCondor) || null;
  return null;
}

export async function condorConnect(): Promise<string | null> {
  const c = getCondor();
  if (!c) throw new Error("Condor provider not found");
  try {
    const accs = await c.request({ method: "eth_requestAccounts" });
    if (!accs?.length) throw new Error("No Condor accounts");
    return accs[0];
  } catch (e: any) {
    if (e?.code === 4001 || /rejected/i.test(String(e?.message))) {
      return null;
    }
    console.error(e);
    (window as any).showToast?.("Wallet error. Please try again.");
    throw e;
  }
}

export async function condorSignRawTx(unsignedTx: any): Promise<string | null> {
  const c = getCondor();
  if (!c) throw new Error("Condor provider not found");
  try {
    let raw = await c
      .request({ method: "eth_signTransaction", params: [unsignedTx] })
      .catch(() => null);
    if (!raw) raw = await c.request({ method: "wallet_signTransaction", params: [unsignedTx] });
    if (!raw) return null;
    if (!/^0x[0-9a-fA-F]+$/.test(raw)) throw new Error("Condor returned non-raw tx");
    return raw;
  } catch (e: any) {
    if (e?.code === 4001 || /rejected/i.test(String(e?.message))) {
      return null;
    }
    console.error(e);
    (window as any).showToast?.("Wallet error. Please try again.");
    throw e;
  }
}
