import React, { useState, useEffect } from 'react';
import { ethers, BrowserProvider, Contract } from 'ethers';
import TOKENS from '../lib/tokens-bsc.js';
import { fromBase, toBase } from '../lib/format';
import { log, clearLogs } from '../lib/logger.js';
import Toasts from './Toasts.jsx';
import useAllowance from '../hooks/useAllowance.js';
import { fetchJSON } from '../lib/net.js';

let inflight;

export default function SafeSwap({ account, serverSigner }) {
  const tokenList = Object.values(TOKENS);
  const [from, setFrom] = useState(TOKENS.BNB);
  const [to, setTo] = useState(TOKENS.GCC);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [status, setStatus] = useState('');
  // slippage in basis points (default 2%)
  const [slippageBps, setSlip] = useState(200);
  const [toasts, setToasts] = useState([]);
  const [swapping, setSwapping] = useState(false);
  const [gas, setGas] = useState(null);
  const [networkOk, setNetworkOk] = useState(true);
  const { ensure: ensureServerAllowance } = useAllowance();

  const addToast = (msg, type='') => setToasts(t => [...t, { msg, type }]);
  const CHAIN_ID = 56;
  const REFLECTION_SET = new Set(['0x092ac429b9c3450c9909433eb0662c3b7c13cf9a']);

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
    inflight?.abort?.();
    inflight = new AbortController();

    try {
      setStatus('Fetching quote…');
      setQuote(null);
      setGas(null);
      clearLogs();
      log('QUOTE start');

      const sellAmount = toBase(amount || '0', from.decimals);
      const qsBase = {
        chainId: String(CHAIN_ID),
        sellToken: from.isNative ? 'BNB' : from.address,
        buyToken: to.isNative ? 'BNB' : to.address,
        sellAmount,
        taker: account,
        slippageBps: String(slippageBps)
      };

      const ZEROX_NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
      const q0x = new URLSearchParams({
        ...qsBase,
        sellToken: from.isNative ? ZEROX_NATIVE : from.address,
        buyToken: to.isNative ? ZEROX_NATIVE : to.address
      }).toString();
      const qDex = new URLSearchParams(qsBase).toString();

      const p0x = fetchJSON(`/api/0x/quote?${q0x}`, { timeoutMs: 6500, signal: inflight.signal });
      const pDex = fetchJSON(`/api/dex/quote?${qDex}`, { timeoutMs: 6500, signal: inflight.signal });

      let winner;
      try {
        winner = await Promise.any([
          p0x.then(r => (r.ok ? { type: 'zeroex', ...r.json } : Promise.reject(r))),
          pDex.then(r => (r.ok ? { type: 'dex', ...r.json } : Promise.reject(r)))
        ]);
      } catch (e) {
        const [r0, r1] = await Promise.allSettled([p0x, pDex]);
        const err =
          (r0.value && !r0.value.ok && (r0.value.json?.validationErrors?.[0]?.reason || r0.value.json?.error || r0.value.json?.message || `HTTP ${r0.value.status}`)) ||
          (r1.value && !r1.value.ok && (r1.value.json?.error || `HTTP ${r1.value.status}`)) ||
          'No route';
        setQuote(null);
        setStatus(`Quote error: ${err}`);
        log(`QUOTE fail: ${err}`);
        return;
      }

      if (winner.type === 'zeroex' && winner.to && winner.data) {
        const tx = { to: winner.to, data: winner.data, value: winner.value ? ethers.toBeHex(winner.value) : undefined };
        const fee = await window.ethereum.request({ method: 'eth_estimateGas', params: [tx] }).catch(() => null);
        setGas(fee);
      }

      setQuote(winner);
      setStatus(`Quote ready (${winner.type === 'dex' ? winner.routerName : '0x'})`);
      log(`QUOTE win: ${winner.type}`);
    } catch (e) {
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

      if (quote.type === 'dex') {
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
            slippageBps
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
      const msg = e?.shortMessage || e?.reason || e?.message || String(e);
      let hint = "";
      if (/INSUFFICIENT_OUTPUT_AMOUNT/i.test(msg)) {
        hint = " Try increasing slippage to 2–5% or reduce trade size.";
      }
      setStatus(`Swap failed: ${msg}.${hint}`);
      log('SWAP ERROR', e);
    }finally{
      setSwapping(false);
    }
  }

  async function swapServerSigner() {
    if (!quote) { setStatus('Get a quote first'); return; }
    setSwapping(true);
    clearLogs();
    try {
      const fromAddr = await serverSigner.getAddress();
      let tx, allowanceTarget;
      if (quote.type === 'dex') {
        const build = await fetch('/api/dex/buildTx', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            from: fromAddr,
            sellToken: from.isNative ? 'BNB' : from.address,
            buyToken: to.isNative ? 'BNB' : to.address,
            amountIn: toBase(amount || '0', from.decimals),
            quoteBuy: quote.buyAmount,
            routerAddr: quote.router,
            slippageBps
          })
        }).then(r => r.json());
        if (build.error) { setStatus(`BuildTx error: ${build.error}`); return; }
        allowanceTarget = build.allowanceTarget || quote.router;
        if (!from.isNative) {
          await ensureServerAllowance({ tokenAddr: from.address, owner: fromAddr, spender: allowanceTarget, amount: toBase(amount || '0', from.decimals), approveMax: true, serverSigner });
        }
        tx = { to: build.to, data: build.data, value: build.value || undefined, chainId: 56 };
        log('DEX TX', tx);
      } else {
        allowanceTarget = quote.allowanceTarget || quote.allowanceTargetAddress || quote.to;
        if (!from.isNative) {
          await ensureServerAllowance({ tokenAddr: from.address, owner: fromAddr, spender: allowanceTarget, amount: toBase(amount || '0', from.decimals), approveMax: true, serverSigner });
        }
        tx = { to: quote.to, data: quote.data, value: quote.value ? ethers.toBeHex(quote.value) : undefined, chainId: 56 };
        log('0x TX', tx);
      }
      setStatus('Sending (server signer)...');
      const rawTx = await serverSigner.signTransaction(tx);
      const resp = await fetch('/api/relay/sendRaw', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rawTx }) });
      const j = await resp.json();
      if (!resp.ok || j.error) throw new Error(j.error || 'relay failed');
      setStatus(`Broadcasted: ${j.txHash || 'sent'}`);
    } catch (e) {
      const msg = e?.shortMessage || e?.reason || e?.message || String(e);
      setStatus(`Swap failed: ${msg}`);
    } finally {
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

  const involvesReflection = (!from.isNative && REFLECTION_SET.has(from.address.toLowerCase())) ||
                             (!to.isNative && REFLECTION_SET.has(to.address.toLowerCase()));

  return (
    <>
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
      <div className="row">
        <label>Slippage</label>
        <input type="number" min="1" max="1000" value={slippageBps} onChange={e=>setSlip(Number(e.target.value))}/> bps
        <div style={{display:'flex', gap:6}}>
          {[200,300,500].map(bps => (
            <button key={bps} type="button" className={slippageBps===bps ? 'pill active' : 'pill'} onClick={()=>setSlip(bps)}>{(bps/100).toFixed(2)}%</button>
          ))}
        </div>
      </div>
      <div className="actions">
        <button className="btn btn--primary" aria-busy={status.startsWith('Fetching')} onClick={getQuote}>
          {status.startsWith('Fetching') ? 'Fetching…' : 'Get Quote'}
        </button>
        {status.startsWith('Fetching') && (
          <button className="btn" onClick={() => { inflight?.abort?.(); setStatus('Cancelled.'); }}>
            Cancel
          </button>
        )}
      </div>
      {status && <p className="status">{status}</p>}
      {involvesReflection && (
        <div className="toast warn">
          GCC is a reflection (fee-on-transfer) token. Higher slippage (2–5%) may be required.
        </div>
      )}
      {quote && (
        <div className="quote">
          {quote.type === 'dex' ? (
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
            Min received (~{(Number(fromBase(quote.buyAmount, to.decimals)) * (1 - slippageBps/10000)).toFixed(8)} {to.symbol}) at {(slippageBps/100).toFixed(2)}% slippage
          </div>
          {gas && <div className="muted">Estimated gas: {Number(gas)/1e5}</div>}
        </div>
      )}
      {!networkOk && <div className="error">Switch to BNB Chain</div>}
      <button
        className="primary"
        disabled={!quote || (quote.type==='zeroex' && !quote.to) || swapping || !networkOk}
        aria-busy={swapping}
        onClick={swapMetaMaskPrivate}>
        {swapping ? 'Swapping…' : 'Swap (MetaMask • Private RPC)'}
      </button>
      {serverSigner && (
        <button
          className="primary"
          disabled={!quote || (quote.type==='zeroex' && !quote.to) || swapping || !networkOk}
          aria-busy={swapping}
          onClick={swapServerSigner}>
          {swapping ? 'Swapping…' : 'Swap (Server Signer)'}
        </button>
      )}
      <Toasts items={toasts} />
    </>
  );
}
