import React, { useState, useEffect } from 'react';
import { ethers, BrowserProvider, Contract } from 'ethers';
import { TOKENS, CHAIN_BSC } from '../lib/tokens';
import { api, getQuote as fetchQuote } from '../lib/api';
import { fromBase, toBase } from '../lib/format';
import { logInfo, logError, logWarn, clearLogs } from '../lib/logger.js';
import useAllowance from '../hooks/useAllowance.js';
import TokenSelect from './TokenSelect.jsx';

let inflight;
let quoteSeq = 0;

function isPositive(x) {
  if (x == null || x === "") return false;
  const n = Number(x);
  return Number.isFinite(n) && n > 0;
}

export default function SafeSwap({ account, serverSigner }) {
  const [fromSym, setFromSym] = useState('BNB');
  const [toSym, setToSym] = useState('GCC');
  const from = TOKENS[fromSym];
  const to = TOKENS[toSym];
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [status, setStatus] = useState('');
  // slippage in basis points (default 2%)
  const [slippageBps, setSlip] = useState(200);
  const [swapping, setSwapping] = useState(false);
  const [gas, setGas] = useState(null);
  const [networkOk, setNetworkOk] = useState(true);
  const [lastParams, setLastParams] = useState(null);
  const { ensure: ensureServerAllowance } = useAllowance();

  const CHAIN_ID = CHAIN_BSC;
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

  async function onGetQuote() {
    const seq = ++quoteSeq;
    inflight?.abort?.();
    inflight = new AbortController();

    try {
      setStatus('Fetching quote…');
      setQuote(null);
      setGas(null);
      clearLogs();
      logInfo("UI: GetQuote clicked", { seq, fromToken: fromSym, toToken: toSym, amount, slippageBps });

      const sellAmount = toBase(amount || '0', from.decimals);
      const data = await fetchQuote({
        fromToken: fromSym,
        toToken: toSym,
        amount: sellAmount,
        slippageBps
      });
      if (seq !== quoteSeq) {
        logWarn("UI: Stale quote ignored", { seq, latest: quoteSeq });
        return;
      }
      logInfo("UI: Quote OK", { seq, data });
      setQuote(data);
      setLastParams({ sellAmount });
      setStatus('Quote ready');
      window.refreshPortfolioValue?.();
    } catch (e) {
      if (seq !== quoteSeq) return;
      const msg = String(e?.message || e);
      logError("UI: Quote FAILED", { seq, err: msg });
      setStatus(msg === 'amount_must_be_positive' ? 'Amount must be positive.' : 'Quote failed — try again.');
      console.error(e);
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

      let tx, allowanceTarget;
      if (quote.source === 'DEX') {
        const minOut = (BigInt(quote.buyAmount) * BigInt(10_000 - slippageBps) / 10_000n).toString();
        const route = { router: quote.router, path: quote.path, amountIn: lastParams.sellAmount, minOut, to: fromAddr, deadline: Math.floor(Date.now()/1000) + 600 };
        tx = await fetch(api('dex/buildTx'), { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ route }) }).then(r=>r.json());
        allowanceTarget = quote.router;
      } else {
        const q = quote.data;
        tx = { to: q.to, data: q.data, value: q.value };
        allowanceTarget = q.allowanceTarget || q.allowanceTargetAddress || q.to;
      }
      if (!from.isNative) await ensureAllowance(allowanceTarget);
      const fee = await window.ethereum.request({ method: 'eth_estimateGas', params: [tx] }).catch(()=>null);
      setGas(fee);
      setStatus('Sending (private RPC)...');
      const sent = await signer.sendTransaction(tx);
      setStatus(`Sent: ${sent.hash}`);
      const rec = await sent.wait();
      setStatus(`Confirmed in block ${rec.blockNumber}`);
      logInfo('RECEIPT', rec);
    } catch(e) {
      console.error(e);
      const msg = e?.shortMessage || e?.reason || e?.message || String(e);
      setStatus(`Swap failed: ${msg}`);
      logError('SWAP ERROR', e);
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
      let tx, allowanceTarget;
      if (quote.source === 'DEX') {
        const minOut = (BigInt(quote.buyAmount) * BigInt(10_000 - slippageBps) / 10_000n).toString();
        const route = { router: quote.router, path: quote.path, amountIn: lastParams.sellAmount, minOut, to: fromAddr, deadline: Math.floor(Date.now()/1000) + 600 };
        tx = await fetch(api('dex/buildTx'), { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ route }) }).then(r=>r.json());
        allowanceTarget = quote.router;
      } else {
        const q = quote.data;
        tx = { to: q.to, data: q.data, value: q.value };
        allowanceTarget = q.allowanceTarget || q.allowanceTargetAddress || q.to;
      }
      if (!from.isNative) {
        await ensureServerAllowance({ tokenAddr: from.address, owner: fromAddr, spender: allowanceTarget, amount: toBase(amount || '0', from.decimals), approveMax: true, serverSigner });
      }
      setStatus('Sending (server signer)...');
      const rawTx = await serverSigner.signTransaction({ ...tx, chainId: 56 });
      const resp = await fetch(api('relay/sendRaw'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rawTx }) });
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

  const canQuote = isPositive(amount) && from && to;

  return (
    <>
      <div>
        From:
        <TokenSelect value={fromSym} onChange={setFromSym} />
      </div>
      <div>
        To:
        <TokenSelect value={toSym} onChange={setToSym} />
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
        <button className="btn btn--primary" aria-busy={status.startsWith('Fetching')} disabled={!canQuote} onClick={onGetQuote}>
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
          <div className="badge">{quote.source}</div>
          <div>Buy Amount: ~{fromBase(quote.buyAmount, to.decimals)} {to.symbol}</div>
          <div className="muted">
            Min received ~{fromBase(quote.minBuyAmount, to.decimals)} {to.symbol} at {(quote.slippageBps/100).toFixed(2)}% slippage
          </div>
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
    </>
  );
}
