import React, { useState, useEffect } from 'react';
import { ethers, BrowserProvider, Contract } from 'ethers';
import TOKENS from '../lib/tokens-bsc.js';
import { fromBase, toBase } from '../lib/format';
import { getBrowserProvider } from '../lib/ethers';
import { log, clearLogs } from '../lib/logger.js';
import SettingsModal from './SettingsModal.jsx';
import Toasts from './Toasts.jsx';

export default function SafeSwap({ account }) {
  const tokenList = Object.values(TOKENS);
  const [from, setFrom] = useState(TOKENS.BNB);
  const [to, setTo] = useState(TOKENS.GCC);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [status, setStatus] = useState('');
  const [settings, setSettings] = useState({ slippageBps:50, deadlineMins:15, approveMax:true });
  const [showSettings, setShowSettings] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [swapping, setSwapping] = useState(false);
  const [gas, setGas] = useState(null);
  const [networkOk, setNetworkOk] = useState(true);

  const addToast = (msg, type='') => setToasts(t => [...t, { msg, type }]);
  const CHAIN_ID = 56;
  const to0xParam = t => t.isNative ? 'BNB' : t.address;

  useEffect(() => {
    async function check(){
      try{
        const chain = await window.ethereum.request({ method: 'eth_chainId' });
        setNetworkOk(chain === '0x38');
      }catch{ setNetworkOk(false); }
    }
    check();
    window.ethereum?.on('chainChanged', check);
    return () => window.ethereum?.removeListener('chainChanged', check);
  }, []);

  async function getQuote() {
    try{
      setStatus('Fetching quote…');
      setQuote(null);
      setGas(null);
      clearLogs();

      let taker = '';
      try { taker = (await getBrowserProvider().send('eth_accounts', []))?.[0] || ''; } catch {}

      const sellAmount = toBase(amount || '0', from.decimals);
      const q0 = new URLSearchParams({
        chainId: '56',
        sellToken: to0xParam(from),
        buyToken:  to0xParam(to),
        sellAmount,
        slippageBps: String(settings.slippageBps)
      });
      if (taker) q0.set('taker', taker);

      let r = await fetch(`/api/0x/quote?${q0}`);
      let j = await r.json().catch(()=> ({}));

      if (r.ok && !j.error && !j.code) {
        const tx = { to: j.to, data: j.data, value: j.value ? ethers.toBeHex(j.value) : undefined };
        const fee = await window.ethereum.request({ method: 'eth_estimateGas', params: [tx] }).catch(()=>null);
        setGas(fee);
        setQuote({ ...j, source: '0x' });
        setStatus('Quote ready.');
        return;
      }

      const qd = new URLSearchParams({
        chainId: '56',
        sellToken: from.isNative ? 'BNB' : from.address,
        buyToken:  to.isNative   ? 'BNB' : to.address,
        sellAmount
      });
      r = await fetch(`/api/dex/quote?${qd}`);
      j = await r.json();

      if (!r.ok) {
        setStatus(`Quote error: ${j.error || j.message || `HTTP ${r.status}`}`);
        return;
      }
      setQuote({ ...j, source: 'DEX' });
      setStatus('Quote ready (DEX).');
    }catch(e){
      setStatus(`Quote failed: ${e.message || String(e)}`);
    }
  }

  async function ensureAllowance(allowanceTarget) {
    if (from.isNative) return true;
    if (!allowanceTarget) throw new Error('Missing allowance target');
    const prov = new BrowserProvider(window.ethereum);
    const signer = await prov.getSigner();
    const erc20 = new Contract(from.address, [
      'function allowance(address owner, address spender) view returns (uint256)',
      'function approve(address spender, uint256 value) returns (bool)'
    ], signer);
    const owner = await signer.getAddress();
    const cur = await erc20.allowance(owner, allowanceTarget);
    const sellAmount = toBase(amount || '0', from.decimals);
    if (cur >= sellAmount) return true;
    setStatus('Approving token allowance…');
    const tx = await erc20.approve(allowanceTarget, ethers.MaxUint256);
    await tx.wait();
    return true;
  }

  async function swapMetaMaskPrivate() {
    if (!quote) { setStatus('Get a quote first'); return; }

    setSwapping(true);
    clearLogs();
    try{
      const prov = new BrowserProvider(window.ethereum);
      const signer = await prov.getSigner();
      const fromAddr = await signer.getAddress();

      let tx, allowanceTarget;

      if (quote.source === 'DEX') {
        const build = await fetch('/api/dex/buildTx', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            from: fromAddr,
            sellToken: from.isNative ? 'BNB' : from.address,
            buyToken:  to.isNative   ? 'BNB' : to.address,
            amountIn:  toBase(amount || '0', from.decimals),
            quoteBuy:  quote.buyAmount,
            routerAddr: quote.router,
            slippageBps: settings.slippageBps
          })
        }).then(r => r.json());

        if (build.error) { setStatus(`BuildTx error: ${build.error}`); return; }
        allowanceTarget = build.allowanceTarget || quote.router;
        if (!from.isNative) await ensureAllowance(allowanceTarget);

        tx = { to: build.to, data: build.data, value: build.value || undefined };
        const fee = await window.ethereum.request({ method: 'eth_estimateGas', params: [tx] }).catch(()=>null);
        setGas(fee);
        log('DEX TX', tx);
      } else {
        allowanceTarget = quote.allowanceTarget || quote.allowanceTargetAddress || quote.to;
        if (!from.isNative) await ensureAllowance(allowanceTarget);
        tx = { to: quote.to, data: quote.data, value: quote.value ? ethers.toBeHex(quote.value) : undefined };
        const fee = await window.ethereum.request({ method: 'eth_estimateGas', params: [tx] }).catch(()=>null);
        setGas(fee);
        log('0x TX', tx);
      }

      setStatus('Sending (private RPC)...');
      const sent = await signer.sendTransaction(tx);
      setStatus(`Broadcasted: ${sent.hash}`);
      const rec = await sent.wait();
      setStatus(`Done in block ${rec.blockNumber}`);
      log('RECEIPT', rec);
    }catch(e){
      console.error(e);
      setStatus(`Swap failed: ${e.message || String(e)}`);
      log('SWAP ERROR', e);
    }finally{
      setSwapping(false);
    }
  }

  async function onMax(){
    try{
      const prov = new BrowserProvider(window.ethereum, 'any');
      const signerAddr = (await prov.send('eth_requestAccounts', []))[0];
      if (!signerAddr) return;
      if (from.isNative){
        const bal = await prov.getBalance(signerAddr);
        setAmount(fromBase(bal, 18));
      } else {
        const erc20 = new Contract(from.address, [
          'function balanceOf(address) view returns (uint256)',
          'function decimals() view returns (uint8)'
        ], prov);
        const [bal, dec] = await Promise.all([
          erc20.balanceOf(signerAddr),
          erc20.decimals().catch(()=>from.decimals||18)
        ]);
        setAmount(fromBase(bal, dec));
      }
    }catch{}
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
      {status && <p className="status">{status}</p>}
      {quote && (
        <div className="quote">
          {quote.source === 'DEX' ? (
            <>
              <div className="badge">DEX</div>
              <div>Buy Amount: ~{fromBase(quote.buyAmount, to.decimals)} {to.symbol}</div>
            </>
          ) : (
            <>
              <div className="badge">0x</div>
              <div>Buy Amount: ~{fromBase(quote.buyAmount, to.decimals)} {to.symbol}</div>
              <div>Route: {quote.route?.fills?.map(f=>f.source).join(' → ') || 'aggregated'}</div>
            </>
          )}
          <div className="muted">
            Min received (~{(Number(fromBase(quote.buyAmount, to.decimals)) * (1 - settings.slippageBps/10000)).toFixed(8)} {to.symbol}) at {settings.slippageBps/100}% slippage
          </div>
          {gas && <div className="muted">Estimated gas: {Number(gas)/1e5}</div>}
        </div>
      )}
      {!networkOk && <div className="error">Switch to BNB Chain</div>}
      <button
        className="primary"
        disabled={!quote || swapping || !networkOk}
        aria-busy={swapping}
        onClick={swapMetaMaskPrivate}>
        {swapping ? 'Swapping…' : 'Swap (MetaMask • Private RPC)'}
      </button>
      <SettingsModal open={showSettings} onClose={()=>setShowSettings(false)} settings={settings} setSettings={setSettings} />
      <Toasts items={toasts} />
    </>
  );
}
