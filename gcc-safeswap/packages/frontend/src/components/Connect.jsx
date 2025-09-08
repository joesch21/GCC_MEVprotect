import React, { useEffect, useState } from "react";
import { getBrowserProvider } from "../lib/ethers.js";
import useBalances from "../hooks/useBalances.js";
import TOKENS from "../lib/tokens-bsc.js";
import { isMobile, metamaskDappLink } from "../lib/deeplink.js";

export default function Connect({ unlockedAddr }) {
  const [account, setAccount] = useState("");
  const [bal, setBal] = useState({});
  const { fetchBNBAndTokens } = useBalances();
  const activeAddress = unlockedAddr || account;

  async function connect() {
    const prov = getBrowserProvider();
    const accounts = await prov.send("eth_requestAccounts", []);
    setAccount(accounts[0]);
  }

  useEffect(() => {
    (async () => {
      try {
        const prov = getBrowserProvider();
        const acc = await prov.send("eth_accounts", []);
        if (acc?.[0]) setAccount(acc[0]);
        prov.on("accountsChanged", (a) => setAccount(a?.[0] || ""));
        prov.on("chainChanged", () => window.location.reload());
      } catch {}
    })();
  }, []);

  useEffect(() => {
    let t;
    async function refresh() {
      if (!activeAddress) return;
      const map = { GCC: TOKENS.GCC.address, WBNB: TOKENS.WBNB.address, USDT: TOKENS.USDT.address };
      const b = await fetchBNBAndTokens(activeAddress, map);
      setBal(b);
    }
    refresh();
    t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [activeAddress]);

  return (
    <div className="connect" style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      {activeAddress ? (
        <>
          <span className="pill">{activeAddress.slice(0,6)}…{activeAddress.slice(-4)}</span>
          <span className="pill pill--success">BNB {Number(bal?.BNB?.amount || 0).toFixed(4)}</span>
          <span className="pill pill--accent">GCC {Number(bal?.GCC?.amount || 0).toFixed(2)}</span>
          {/* mini portfolio dropdown */}
          <details className="pill" style={{cursor:"pointer"}}>
            <summary>Portfolio</summary>
            <div style={{paddingTop:6}}>
              <div>WBNB {Number(bal?.WBNB?.amount || 0).toFixed(4)}</div>
              <div>USDT {Number(bal?.USDT?.amount || 0).toFixed(2)}</div>
            </div>
          </details>
        </>
      ) : (
        <>
          <button onClick={connect}>Connect MetaMask</button>
          {isMobile() && <a className="pill pill--success" href={metamaskDappLink()}>Open in MetaMask</a>}
        </>
      )}
    </div>
  );
}
