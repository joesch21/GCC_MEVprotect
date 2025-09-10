import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider } from "ethers";
import { getBalancesUSD } from "../lib/portfolio";

export function usePortfolio(account?: string) {
  const [state, setState] = useState<{ totalUsd: number; bnb: number; gcc: number }>({
    totalUsd: 0,
    bnb: 0,
    gcc: 0
  });
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!account || typeof window === "undefined") return;
    try {
      const provider = new BrowserProvider((window as any).ethereum ?? (window as any).condor, "any");
      const res = await getBalancesUSD(provider, account);
      setState(s => ({ ...s, totalUsd: res.totalUsd, bnb: res.bnb, gcc: res.gcc }));
    } catch {
      // keep last good state
    }
  }, [account]);

  useEffect(() => {
    if (!account) return;
    refresh();
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(refresh, 60_000) as any;
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [account, refresh]);

  useEffect(() => {
    const eth = (window as any).ethereum ?? (window as any).condor;
    if (!eth?.on) return;
    const onAccounts = () => refresh();
    const onChain = () => refresh();
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [refresh]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("portfolio:refresh", handler);
    window.addEventListener("swap:completed", handler);
    return () => {
      window.removeEventListener("portfolio:refresh", handler);
      window.removeEventListener("swap:completed", handler);
    };
  }, [refresh]);

  return state; // { totalUsd, bnb, gcc }
}
