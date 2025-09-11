import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider } from "ethers";
import { computePortfolioUSD } from "../lib/portfolio";

type State = { totalUsd: number; bnb: number; gcc: number; bnbUsd: number; gccUsd: number; stale: boolean; updatedAt: string };

export function usePortfolio(account?: string) {
  const [state, setState] = useState<State>({ totalUsd: 0, bnb: 0, gcc: 0, bnbUsd: 0, gccUsd: 0, stale: false, updatedAt: "" });
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!account || typeof window === "undefined") return;
    const eth: any = (window as any).ethereum ?? (window as any).condor;
    if (!eth) return;

    const provider = new BrowserProvider(eth, "any");
    const res = await computePortfolioUSD(provider, account);

    // send to in-app Debug Log if available
    try {
      (window as any).__log?.("UI: Portfolio updated", {
        bnb: res.bnb,
        gcc: res.gcc,
        bnbUsd: res.bnbUsd,
        gccUsd: res.gccUsd,
        totalUsd: res.totalUsd,
      });
    } catch {}

    setState({ totalUsd: res.totalUsd, bnb: res.bnb, gcc: res.gcc, bnbUsd: res.bnbUsd, gccUsd: res.gccUsd, stale: res.stale, updatedAt: res.updatedAt });
  }, [account]);

  useEffect(() => {
    if (!account) return;
    refresh();
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(refresh, 60_000) as any; // 60s
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [account, refresh]);

  // react to swaps & manual refresh
  useEffect(() => {
    const handle = () => refresh();
    window.addEventListener("swap:completed", handle);
    window.addEventListener("portfolio:refresh", handle);
    return () => {
      window.removeEventListener("swap:completed", handle);
      window.removeEventListener("portfolio:refresh", handle);
    };
  }, [refresh]);

  // react to wallet events
  useEffect(() => {
    const eth: any = (window as any).ethereum ?? (window as any).condor;
    if (!eth?.on) return;
    const onAcc = () => refresh();
    const onChain = () => refresh();
    eth.on("accountsChanged", onAcc);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAcc);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [refresh]);

  return state;
}
