import React, { useEffect, useMemo, useState } from "react";
import { formatUnits, ZeroAddress } from "ethers";
import { getBrowserProvider } from "../lib/ethers.js";

// GCC token (BSC)
const GCC = "0x092aC429b9c3450c9909433eB0662c3b7c13cF9A";
// Minimal ERC20 ABI for balanceOf/decimals
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

export default function Portfolio({ account }) {
  const [bnb, setBnb] = useState(null);
  const [gcc, setGcc] = useState(null);
  const [gccUsd, setGccUsd] = useState(null);
  const [loading, setLoading] = useState(false);

  const short = useMemo(() => {
    if (!account) return "";
    return `${account.slice(0, 6)}…${account.slice(-4)}`;
  }, [account]);

  useEffect(() => {
    if (!account) {
      setBnb(null); setGcc(null); setGccUsd(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const provider = getBrowserProvider();

        // 1) Native BNB balance
        const bal = await provider.getBalance(account);
        if (!cancelled) setBnb(Number(formatUnits(bal, 18)));

        // 2) GCC balance
        const gccCtr = new (await import("ethers")).Contract(GCC, ERC20_ABI, provider);
        const [raw, dec] = await Promise.all([
          gccCtr.balanceOf(account),
          gccCtr.decimals()
        ]);
        const gccBal = Number(formatUnits(raw, dec));
        if (!cancelled) setGcc(gccBal);

        // 3) GCC USD price from backend (DexScreener bridge)
        const res = await fetch("/api/price/gcc"); // returns { symbol, usd }
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setGccUsd(typeof data.usd === "number" ? data.usd : null);
        } else {
          if (!cancelled) setGccUsd(null);
        }
      } catch {
        if (!cancelled) { setGccUsd(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // refresh every 30s while mounted
    const id = setInterval(() => {
      if (account) {
        // trigger re-run
        setBnb((x) => x);
      }
    }, 30000);

    return () => { cancelled = true; clearInterval(id); };
  }, [account]);

  const gccUsdTotal = useMemo(() => {
    if (gcc == null || gccUsd == null) return null;
    return gcc * gccUsd;
  }, [gcc, gccUsd]);

  const onConnect = async () => {
    if (account) return;
    try {
      await getBrowserProvider().send("eth_requestAccounts", []);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="portfolio">
      <button className="pill pill--address" title={account || ""} onClick={onConnect}>
        {account ? short : "Connect"}
      </button>

      <div className="pill pill--metric">
        <span>BNB</span>
        <strong>{bnb == null ? "…" : bnb.toFixed(4)}</strong>
      </div>

      <div className="pill pill--metric">
        <span>GCC</span>
        <strong>
          {gcc == null ? "…" : gcc.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </strong>
      </div>

      <div className="pill pill--metric pill--usd" title="GCC ≈ USD">
        <span>≈ USD</span>
        <strong>
          {gccUsdTotal == null
            ? "…" 
            : gccUsdTotal.toLocaleString(undefined, { style: "currency", currency: "USD" })}
        </strong>
      </div>

      {loading && <span className="portfolio__spinner" aria-hidden />}
    </div>
  );
}

