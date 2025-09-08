import React, { useState } from 'react';
import { BrowserProvider, Contract, formatUnits, ethers } from 'ethers';
import TOKENS from '../lib/tokens-bsc.js';
import { formatAmount, toBase } from '../lib/format';
import { getBurner, getBrowserProvider } from '../lib/ethers';
import { log } from '../lib/logger.js';
import useAllowance from '../hooks/useAllowance.js';
import SettingsModal from './SettingsModal.jsx';
import Toasts from './Toasts.jsx';

const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export default function SafeSwap({ account, serverSigner }) {
  const tokenList = Object.values(TOKENS);
  const [from, setFrom] = useState(TOKENS.BNB);
  const [to, setTo] = useState(TOKENS.GCC);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [status, setStatus] = useState('');
  const [settings, setSettings] = useState({ slippageBps:50, deadlineMins:15, approveMax:true });
  const [showSettings, setShowSettings] = useState(false);
  const [toasts, setToasts] = useState([]);
  const { ensure } = useAllowance();
  const addToast = (msg, type='') => setToasts(t => [...t, { msg, type }]);
  const CHAIN_ID = 56;
  const to0xParam = t => t.isNative ? 'BNB' : t.address;

  async function getQuote(){
    try{
      setStatus('Fetching quote…');
      const sellAmount = toBase(amount || '0', from.decimals).toString();
      let taker = '';
      try { taker = (await getBrowserProvider().send('eth_accounts', []))?.[0] || ''; } catch {}
      const qs = new URLSearchParams({
        chainId: String(CHAIN_ID),
        sellToken: to0xParam(from),
        buyToken: to0xParam(to),
        sellAmount,
        slippageBps: String(settings.slippageBps)
      });
      if (taker) qs.set('taker', taker);
      const url = `/api/0x/quote?${qs}`;
      log('QUOTE →', url);
      const r = await fetch(url);
      const j = await r.json().catch(()=> ({}));
      log('QUOTE ⇠', r.status, j);
      if (r.ok && !j.error && !j.code){
        setQuote(j);
        setStatus('Quote ready.');
        return;
      }
      const drUrl = `/api/dex/quote?${new URLSearchParams({ chainId:String(CHAIN_ID), sellToken: to0xParam(from), buyToken: to0xParam(to), sellAmount })}`;
      log('DEXQUOTE →', drUrl);
      const dr = await fetch(drUrl);
      const dj = await dr.json();
      log('DEXQUOTE ⇠', dr.status, dj);
      if (!dr.ok){
        setQuote(null);
        setStatus(`Quote error: ${dj.error || j?.message || `HTTP ${dr.status}`}`);
        return;
      }
      setQuote({ ...dj, route: { source: 'DEX Router' } });
      setStatus('Quote ready (DEX).');
    }catch(e){
      setQuote(null);
      setStatus(`Quote failed: ${e.message || String(e)}`);
      log('QUOTE FAILED:', e);
    }
  }

  async function swapMetaMaskPrivate(){
    if (!quote) return;
    try{
      const amountBase = toBase(amount, from.decimals);
      const spender = quote.allowanceTarget || quote.router || quote.to;
      if (!from.isNative){
        await ensure({ tokenAddr: from.address, owner: account, spender, amount: amountBase, approveMax: settings.approveMax });
        addToast('Approve success','success');
      }
      const prov = new BrowserProvider(window.ethereum);
      const signer = await prov.getSigner();
      let tx;
      if (quote.route?.source === 'DEX Router'){
        const build = await fetch('/api/dex/buildTx', {
          method:'POST', headers:{ 'content-type':'application/json' },
          body: JSON.stringify({
            from: await signer.getAddress(),
            sellToken: from.isNative ? 'BNB' : from.address,
            buyToken: to.isNative ? 'BNB' : to.address,
            amountIn: amountBase.toString(),
            quoteBuy: quote.buyAmount,
            routerAddr: quote.router,
            slippageBps: settings.slippageBps
          })
        }).then(r=>r.json());
        if (build.error){ setStatus(`BuildTx error: ${build.error}`); return; }
        tx = build;
      } else {
        tx = { to: quote.to, data: quote.data, value: quote.value ? ethers.toBeHex(quote.value) : undefined };
      }
      setStatus('Sending (private RPC)...');
      const sent = await signer.sendTransaction(tx);
      const rec = await sent.wait();
      setStatus(`Done in block ${rec.blockNumber}`);
    }catch(e){
      addToast(e.message,'error');
    }
  }

  async function swapRelay(){
    if (!quote) return;
    try{
      const amountBase = toBase(amount, from.decimals);
      const spender = quote.allowanceTarget || quote.router || quote.to;
      if (serverSigner && !from.isNative){
        await ensure({ tokenAddr: from.address, owner: account, spender, amount: amountBase, approveMax: settings.approveMax, serverSigner });
        addToast('Approve success','success');
      }
      let txReq;
      if (quote.route?.source === 'DEX Router'){
        const build = await fetch('/api/dex/buildTx', {
          method:'POST', headers:{ 'content-type':'application/json' },
          body: JSON.stringify({
            from: account,
            sellToken: from.isNative ? 'BNB' : from.address,
            buyToken: to.isNative ? 'BNB' : to.address,
            amountIn: amountBase.toString(),
            quoteBuy: quote.buyAmount,
            routerAddr: quote.router,
            slippageBps: settings.slippageBps
          })
        }).then(r=>r.json());
        if (build.error){ setStatus(`BuildTx error: ${build.error}`); return; }
        txReq = { ...build, chainId: CHAIN_ID };
      } else {
        txReq = { to: quote.to, data: quote.data, value: quote.value, chainId: CHAIN_ID };
      }
      const signer = serverSigner || getBurner();
      const signed = await signer.signTransaction(txReq);
      const data = await fetch('/api/relay/sendRaw', {
        method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ rawTx: signed })
      }).then(r=>r.json());
      addToast(data.result ? 'Tx relayed' : data.error, data.result ? 'success' : 'error');
    }catch(e){
      addToast(e.message,'error');
    }
  }

  async function onMax(){
    try{
      const prov = new BrowserProvider(window.ethereum, 'any');
      const signerAddr = (await prov.send('eth_requestAccounts', []))[0];
      if (!signerAddr) return;
      const GAS_BUFFER_BNB = 0.002;
      if (from.isNative){
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
      <div style={{textAlign:'right'}}>
        <button className="primary" onClick={()=>setShowSettings(true)}>⚙️</button>
      </div>
      <div>
        From:
        <select value={from.address} onChange={e => setFrom(tokenList.find(t => t.address === e.target.value))}>
          {tokenList.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
        </select>
      </div>
      <div>
        To:
        <select value={to.address} onChange={e => setTo(tokenList.find(t => t.address === e.target.value))}>
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
          <p>Buy Amount: {formatAmount(BigInt(quote.buyAmount), to.decimals)}{quote.route?.source === 'DEX Router' ? ' (DEX)' : ''}</p>
        </div>
      )}
      <button className="success" onClick={swapMetaMaskPrivate}>Swap (MetaMask • Private RPC)</button>
      <button className="success" onClick={swapRelay}>Swap (Embedded • Server Relay)</button>
      <SettingsModal open={showSettings} onClose={()=>setShowSettings(false)} settings={settings} setSettings={setSettings} />
      <Toasts items={toasts} />
    </>
  );
}

