import React, { useEffect, useMemo, useState } from "react";
import { formatUnits } from "ethers";
import { getBrowserProvider } from "../lib/ethers.js";
import useGccBalance from "../hooks/useGccBalance.ts";
import { api } from "../lib/api.js";
import { logInfo, logError } from "../lib/logger.js";
import { isMobile, dappDeepLink, addNetworkDeepLink } from "../lib/metamask.js";

const GCC_TOKEN = import.meta.env.VITE_TOKEN_GCC;

export default function Portfolio({ account }) {
  const [bnb, setBnb] = useState(null);
  const [bnbWei, setBnbWei] = useState(0n);
  const [usd, setPortfolioUSD] = useState(null);
  const { balance: gccBal, raw: gccWei, err: gccErr } = useGccBalance(GCC_TOKEN, account);

  const short = useMemo(() => {
    if (!account) return "";
    return `${account.slice(0, 6)}…${account.slice(-4)}`;
  }, [account]);

  useEffect(() => {
    console.debug("VITE_TOKEN_GCC", GCC_TOKEN);
  }, []);

  useEffect(() => {
    if (!account) { setBnb(null); setBnbWei(0n); return; }
    let cancelled = false;
    (async () => {
      try {
        const provider = getBrowserProvider();
        const bal = await provider.getBalance(account);
        if (!cancelled) {
          setBnb(Number(formatUnits(bal, 18)));
          setBnbWei(bal);
        }
      } catch {
        if (!cancelled) setBnb(null);
      }
    })();
    return () => { cancelled = true; };
  }, [account]);

  async function refreshPortfolioValue() {
    try {
      const url = api("/api/pricebook");
      const pb = await fetch(url).then(r => r.json());

      const bnbUsd = BigInt(pb.wbnbUsd);
      const gccUsd = BigInt(pb.gccUsd);

      const gccUsdValue = (BigInt(gccWei || 0n) * gccUsd) / 10n**18n;
      const bnbUsdValue = (bnbWei * bnbUsd) / 10n**18n;
      const totalUsdWei = gccUsdValue + bnbUsdValue;
      const totalUsd = Number(totalUsdWei) / 1e18;
      setPortfolioUSD(totalUsd);
      logInfo("UI: Portfolio updated", { totalUsd });
    } catch (e) {
      logError("UI: Portfolio refresh failed", String(e?.message || e));
    }
  }

  useEffect(() => {
    refreshPortfolioValue();
  }, [account, gccWei, bnbWei]);

  useEffect(() => {
    window.refreshPortfolioValue = refreshPortfolioValue;
    return () => { delete window.refreshPortfolioValue; };
  }, [gccWei, bnbWei, account]);

  const onConnect = async () => {
    if (account) return;
    try {
      await getBrowserProvider().send("eth_requestAccounts", []);
    } catch {}
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
        <strong>{gccBal != null ? gccBal.toFixed(2) : "—"}</strong>
      </div>
      {gccErr && <span className="muted" style={{marginLeft:8}}>({gccErr})</span>}
      <button className="pill">
        ▸ Portfolio {usd != null ? `• $${usd.toFixed(2)}` : ''}
      </button>
      {isMobile() && !window.ethereum && (
        <div className="actions">
          <a className="btn" href={dappDeepLink(window.location.origin)}>Open in MetaMask</a>
          <a className="btn" href={addNetworkDeepLink()}>Add BNB (Private)</a>
        </div>
      )}
    </div>
  );
}
