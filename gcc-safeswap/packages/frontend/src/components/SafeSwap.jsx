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
  const [lastParams, setLastParams] = useState(null);
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

      const sellAmount = toBase(amount || '0', from.decimals);
      // UI shows BNB, but server DEX path uses WBNB for router quotes.
      // Keep this invisible to the user; only the server maps native ↔ wrapped.
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

      const r0x = await fetchJSON(`/api/0x/quote?${q0x}`, { timeoutMs: 6500, signal: inflight.signal });
      if (r0x.ok && r0x.json?.to && r0x.json?.data) {
        setQuote({ type: 'zeroex', ...r0x.json });
        setLastParams(qsBase);
        setStatus('Quote ready (0x)');
        return;
      }

      addToast('0x quote unavailable; using DEX route');

      const qDex = new URLSearchParams(qsBase).toString();
      const rDex = await fetchJSON(`/api/dex/quote?${qDex}`, { timeoutMs: 6500, signal: inflight.signal });
      if (!rDex.ok) {
        const err = rDex.json?.error || `HTTP ${rDex.status}`;
        setStatus(`Quote error: ${err}`);
        return;
      }
      setQuote({ type: 'dex', ...rDex.json });
      setLastParams(qsBase);
      setStatus('Quote ready (DEX)');
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
    if (!quote || !lastParams) { setStatus('Get a quote first'); return; }
    if (!window.ethereum) {
      window.location.href = `https://metamask.app.link/dapp/${window.location.host}`;
      return;
    }

    setSwapping(true);
    clearLogs();
    try{
      const prov = new BrowserProvider(window.ethereum);
      const signer = await prov.getSigner();
      const fromAddr = await signer.getAddress();

      const qs = new URLSearchParams({ ...lastParams, taker: fromAddr }).toString();
      const build = await fetchJSON(`/api/dex/buildTx?${qs}`);
      if (!build.ok) { setStatus(`BuildTx error: ${build.json?.error || build.status}`); return; }
      const { tx, quote: q, source } = build.json;
      const allowanceTarget = source === '0x'
        ? (q.allowanceTarget || q.allowanceTargetAddress || tx.to)
        : (q.router || tx.to);
      if (!from.isNative) await ensureAllowance(allowanceTarget);
      const fee = await window.ethereum.request({ method: 'eth_estimateGas', params: [tx] }).catch(()=>null);
      setGas(fee);
      setStatus('Sending (private RPC)...');
      const sent = await signer.sendTransaction(tx);
      setStatus(`Sent: ${sent.hash}`);
      const rec = await sent.wait();
      setStatus(`Confirmed in block ${rec.blockNumber}`);
      log('RECEIPT', rec);
    } catch(e) {
      console.error(e);
      const msg = e?.shortMessage || e?.reason || e?.message || String(e);
      setStatus(`Swap failed: ${msg}`);
      log('SWAP ERROR', e);
    } finally {
      setSwapping(false);
    }
  }

  async function swapServerSigner() {
    if (!quote || !lastParams) { setStatus('Get a quote first'); return; }
    setSwapping(true);
    clearLogs();
    try {
      const fromAddr = await serverSigner.getAddress();
      const qs = new URLSearchParams({ ...lastParams, taker: fromAddr }).toString();
      const build = await fetchJSON(`/api/dex/buildTx?${qs}`);
      if (!build.ok) { setStatus(`BuildTx error: ${build.json?.error || build.status}`); return; }
      const { tx, quote: q, source } = build.json;
      const allowanceTarget = source === '0x'
        ? (q.allowanceTarget || q.allowanceTargetAddress || tx.to)
        : (q.router || tx.to);
      if (!from.isNative) {
        await ensureServerAllowance({ tokenAddr: from.address, owner: fromAddr, spender: allowanceTarget, amount: toBase(amount || '0', from.decimals), approveMax: true, serverSigner });
      }
      setStatus('Sending (server signer)...');
      const rawTx = await serverSigner.signTransaction({ ...tx, chainId: 56 });
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
        disabled={!quote || swapping || !networkOk}
        aria-busy={swapping}
        onClick={swapMetaMaskPrivate}>
        {swapping ? 'Swapping…' : 'Swap (MetaMask • Private RPC)'}
      </button>
      {serverSigner && (
        <button
          className="primary"
          disabled={!quote || swapping || !networkOk}
          aria-busy={swapping}
          onClick={swapServerSigner}>
          {swapping ? 'Swapping…' : 'Swap (Server Signer)'}
        </button>
      )}
      <Toasts items={toasts} />
    </>
  );
}
