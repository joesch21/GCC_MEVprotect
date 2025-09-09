import React, { useEffect, useState } from "react";
import { getBrowserProvider } from "../lib/ethers.js";
import useBalances from "../hooks/useBalances.js";
import TOKENS from "../lib/tokens-bsc.js";
import { isMobile, addNetworkDeepLink } from "../lib/metamask.js";
import { openMetaMaskDapp } from "../lib/deeplink.js";
import useGccUsd from "../hooks/useGccUsd.js";

export default function Connect({ unlockedAddr }) {
  const [account, setAccount] = useState("");
  const [bal, setBal] = useState({});
  const { fetchBNBAndTokens } = useBalances();
  const activeAddress = unlockedAddr || account;
  const { usd, gcc, price, loading, source } = useGccUsd(activeAddress);

  async function connect() {
    const prov = getBrowserProvider();
    const accounts = await prov.send("eth_requestAccounts", []);
    setAccount(accounts[0]);
  }

  async function switchToPrivateRPC() {
    const prov = getBrowserProvider();
    const BSC_PARAMS = {
      chainId: "0x38",
      chainName: "BNB Smart Chain (MEV Guard)",
      nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
      rpcUrls: ["https://bscrpc.pancakeswap.finance"],
      blockExplorerUrls: ["https://bscscan.com"]
    };
    try {
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [BSC_PARAMS] });
    } catch {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_PARAMS.chainId }] });
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const prov = getBrowserProvider();
        const acc = await prov.send("eth_accounts", []);
        if (acc?.[0]) setAccount(acc[0]);
      } catch {}
    })();
    const eth = window.ethereum;
    if (eth?.on) {
      const onAcc = (a) => setAccount(a?.[0] || "");
      const onChain = () =>
        setTimeout(async () => {
          try {
            const prov = getBrowserProvider();
            const acc = await prov.send("eth_accounts", []);
            setAccount(acc?.[0] || "");
          } catch {}
        }, 200);
      eth.on("accountsChanged", onAcc);
      eth.on("chainChanged", onChain);
      return () => {
        eth.removeListener("accountsChanged", onAcc);
        eth.removeListener("chainChanged", onChain);
      };
    }
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
            <details className="pill" style={{cursor:"pointer"}}>
              <summary>
                Portfolio {loading ? '' : (usd != null ? `• $${usd.toFixed(2)}` : '')}
              </summary>
              <div style={{paddingTop:6}}>
                {gcc != null && <div>GCC {gcc.toFixed(2)}</div>}
                {price != null && <div>Price ${price.toFixed(4)} {source ? `(${source})` : ''}</div>}
                {usd != null && <div>Total ${usd.toFixed(2)}</div>}
                <div>WBNB {Number(bal?.WBNB?.amount || 0).toFixed(4)}</div>
                <div>USDT {Number(bal?.USDT?.amount || 0).toFixed(2)}</div>
              </div>
            </details>
        </>
      ) : (
        <>
          <button onClick={connect}>Connect MetaMask</button>
          {isMobile() && !window.ethereum && (
            <>
              <button className="btn" onClick={() => openMetaMaskDapp(window.location.origin)}>Open in MetaMask</button>
              <a className="btn" href={addNetworkDeepLink()}>Add Private RPC</a>
            </>
          )}
        </>
      )}
      <button className="btn" onClick={switchToPrivateRPC}>Use Private RPC</button>
    </div>
  );
}
