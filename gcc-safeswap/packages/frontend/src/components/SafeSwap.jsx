import React, { useState } from 'react';
import { BrowserProvider, Contract, formatUnits } from 'ethers';
import TOKENS from '../lib/tokens-bsc.js';
import { formatAmount, toBase } from '../lib/format';
import { getSigner, getBurner, getBrowserProvider } from '../lib/ethers';
import useQuote from '../hooks/useQuote.js';
import { log } from "../lib/logger.js";
import useAllowance from '../hooks/useAllowance.js';
import RouteInspector from './RouteInspector.jsx';
import ImpactWarning from './ImpactWarning.jsx';
import SettingsModal from './SettingsModal.jsx';
import Toasts from './Toasts.jsx';

const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export default function SafeSwap({ account, serverSigner }) {
  const tokenList = Object.values(TOKENS);
  window.TOKENS = TOKENS;
  const [mode, setMode] = useState('0x');
  const [from, setFrom] = useState(TOKENS.BNB);
  const [to, setTo] = useState(TOKENS.GCC);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [settings, setSettings] = useState({ slippageBps:50, deadlineMins:15, approveMax:true });
  const [toasts, setToasts] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [impact, setImpact] = useState(false);

  const { fetchApe } = useQuote({ chainId:56 });
  const { ensure } = useAllowance();

  const GAS_BUFFER_BNB = 0.002; // ~2e-3 BNB ~ ~$1-ish depending on price

  const addToast = (msg, type='') => setToasts(t => [...t, { msg, type }]);

  const tokenForAddr = (addr) => tokenList.find(t => t.address === addr);

  const [status, setStatus] = useState("");
  const CHAIN_ID = 56;
  const nativeLabel = (t) => t.isNative ? "BNB" : t.address;

  async function getQuote() {
    try {
      if (mode !== '0x') {
        const amountBase = toBase(amount, from.decimals);
        const q = await fetchApe({ fromToken:from, toToken:to, amountBase });
        setQuote(q);
        setStatus("Quote ready.");
        if (q.lpLabel) {
          try {
            const pair = '0x5d5Af3462348422B6A6b110799FcF298CFc041D3';
            const r = await fetch(`/api/apeswap/pairReserves?pair=${pair}`);
            const j = await r.json();
            const r0 = BigInt(j.reserve0); const r1 = BigInt(j.reserve1);
            setImpact(r0 < 5000n*10n**18n || r1 < 5n*10n**18n);
          } catch { setImpact(false); }
        } else { setImpact(false); }
        return;
      }

      setStatus("Fetching quote…");

      let taker = "";
      try { taker = (await getBrowserProvider().send("eth_accounts", []))?.[0] || ""; }
      catch {}

      const sellAmount = toBase(amount, from.decimals).toString();
      const qs = new URLSearchParams({
        chainId: String(CHAIN_ID),
        sellToken: nativeLabel(from),
        buyToken: nativeLabel(to),
        sellAmount,
        slippageBps: String(settings.slippageBps),
      });
      if (taker) qs.set("taker", taker);

      const url = `/api/0x/quote?${qs.toString()}`;
      log("QUOTE →", url);
      const r = await fetch(url);
      const j = await r.json().catch(()=> ({}));
      log("QUOTE ⇠", r.status, j);

      if (!r.ok || j.code || j.error) {
        const reason = j.validationErrors?.[0]?.reason || j.reason || j.error || `HTTP ${r.status}`;
        setQuote(null);
        setStatus(`Quote error: ${reason}`);
        log("QUOTE ERROR:", reason);
        return;
      }

      setQuote(j);
      setStatus("Quote ready.");
      if (j.lpLabel) {
        try {
          const pair = '0x5d5Af3462348422B6A6b110799FcF298CFc041D3';
          const r2 = await fetch(`/api/apeswap/pairReserves?pair=${pair}`);
          const j2 = await r2.json();
          const r0 = BigInt(j2.reserve0); const r1 = BigInt(j2.reserve1);
          setImpact(r0 < 5000n*10n**18n || r1 < 5n*10n**18n);
        } catch { setImpact(false); }
      } else { setImpact(false); }
    } catch (e) {
      setQuote(null);
      setStatus(`Quote failed: ${e.message || String(e)}`);
      log("QUOTE FAILED:", e);
    }
  }

  async function swapMetaMask() {
    if (!quote) return;
    try {
      const amountBase = toBase(amount, from.decimals);
      const spender = quote.allowanceTarget || (quote.tx ? quote.tx.to : undefined);
      if (from.address !== NATIVE) {
        await ensure({ tokenAddr:from.address, owner:account, spender, amount:amountBase, approveMax:settings.approveMax });
        addToast('Approve success','success');
      }
      let txReq = quote.tx;
      if (mode === 'apeswap') {
        const minOut = (BigInt(quote.buyAmount) * BigInt(10000 - settings.slippageBps)) / 10000n;
        const build = await fetch('/api/apeswap/buildTx', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({ from:account, sellToken:from.address, buyToken:to.address, amountIn:amountBase, minAmountOut:minOut.toString() })
        }).then(r=>r.json());
        txReq = { to:build.to, data:build.data, value:build.value };
      }
      const signer = await getSigner();
      const tx = await signer.sendTransaction(txReq);
      addToast('Tx sent','success');
      await tx.wait();
      addToast('Tx confirmed','success');
    } catch(e) {
      addToast(e.message,'error');
    }
  }

  async function swapRelay() {
    if (!quote) return;
    try {
      const amountBase = toBase(amount, from.decimals);
      const spender = quote.allowanceTarget || (quote.tx ? quote.tx.to : undefined);
      if (serverSigner && from.address !== NATIVE) {
        await ensure({ tokenAddr:from.address, owner:account, spender, amount:amountBase, approveMax:settings.approveMax, serverSigner });
        addToast('Approve success','success');
      }
      let txReq = { ...quote.tx, chainId:56 };
      if (mode === 'apeswap') {
        const minOut = (BigInt(quote.buyAmount) * BigInt(10000 - settings.slippageBps)) / 10000n;
        const build = await fetch('/api/apeswap/buildTx', {
          method:'POST', headers:{'content-type':'application/json'},
          body:JSON.stringify({ from:account, sellToken:from.address, buyToken:to.address, amountIn:amountBase, minAmountOut:minOut.toString() })
        }).then(r=>r.json());
        txReq = { to:build.to, data:build.data, value:build.value, chainId:56 };
      }
      const signer = serverSigner || getBurner();
      const signed = await signer.signTransaction(txReq);
      const data = await fetch('/api/relay/sendRaw', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ rawTx:signed })
      }).then(r=>r.json());
      addToast(data.result ? 'Tx relayed' : data.error, data.result ? 'success' : 'error');
    } catch(e) {
      addToast(e.message,'error');
    }
  }

  async function onMax() {
    try {
      const prov = new BrowserProvider(window.ethereum, 'any');
      const signerAddr = (await prov.send('eth_requestAccounts', []))[0];
      if (!signerAddr) return;

      if (from.isNative) {
        const bnbWei = await prov.getBalance(signerAddr);
        const bnb = Number(formatUnits(bnbWei, 18));
        const max = Math.max(0, bnb - GAS_BUFFER_BNB);
        setAmount(max.toFixed(6));
      } else {
        const erc20 = new Contract(from.address, [
          'function balanceOf(address) view returns (uint256)',
          'function decimals() view returns (uint8)'
        ], prov);
        const [bal, dec] = await Promise.all([
          erc20.balanceOf(signerAddr),
          erc20.decimals().catch(()=>from.decimals||18)
        ]);
        const max = Number(formatUnits(bal, dec));
        setAmount(max.toFixed(dec > 6 ? 6 : dec));
      }
    } catch {}
  }

  return (
    <>
      <div>
        Mode:
        <select value={mode} onChange={e => setMode(e.target.value)}>
          <option value="0x">0x RFQ + shielded send</option>
          <option value="apeswap">ApeSwap Router (direct LP)</option>
        </select>
        <span className="pill pill--accent">SAFE</span>
        <button className="primary" style={{float:'right'}} onClick={()=>setShowSettings(true)}>⚙️</button>
      </div>
      <div>
        From:
        <select value={from.address} onChange={e => setFrom(tokenForAddr(e.target.value))}>
          {tokenList.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
        </select>
      </div>
      <div>
        To:
        <select value={to.address} onChange={e => setTo(tokenForAddr(e.target.value))}>
          {tokenList.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
        </select>
      </div>
      <div className="row">
        <label>Amount:</label>
        <input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" />
        <button className="btn btn--primary" type="button" onClick={onMax}>Max</button>
      </div>
      <button className="primary" onClick={getQuote}>Get Quote</button>
      {status && <p>{status}</p>}
      {quote && (
        <div>
          <p>Buy Amount: {formatAmount(BigInt(quote.buyAmount), to.decimals)}</p>
          <RouteInspector text={quote.routeText} lpLabel={quote.lpLabel} />
          <ImpactWarning show={impact} />
        </div>
      )}
      <button className="success" onClick={swapMetaMask}>Swap (MetaMask • Private RPC)</button>
      <button className="success" onClick={swapRelay}>Swap (Embedded • Server Relay)</button>
      <SettingsModal open={showSettings} onClose={()=>setShowSettings(false)} settings={settings} setSettings={setSettings} />
      <Toasts items={toasts} />
    </>
  );
}
