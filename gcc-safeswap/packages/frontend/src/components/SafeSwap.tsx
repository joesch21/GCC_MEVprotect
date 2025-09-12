import React, { useState, useEffect } from 'react';
import { ethers, BrowserProvider, Contract } from 'ethers';
import { TOKENS, CHAIN_BSC } from '../lib/tokens';
import { getQuote as fetchQuote, buildApproveTx, buildSwapTx, health as fetchHealth } from '../lib/api';
import { fromBase, toBase } from '../lib/format';
import { logInfo, logError, logWarn, clearLogs } from '../lib/logger.js';
import TokenSelect from './TokenSelect.jsx';
import { sendViaPrivateRelay } from '../lib/condor/relay';
import { CondorSigner } from '../lib/condor/signer';

interface CondorCtx {
  address: string;
  signer: CondorSigner;
}

let inflight;
let quoteSeq = 0;

function isPositive(x) {
  if (x == null || x === "") return false;
  const n = Number(x);
  return Number.isFinite(n) && n > 0;
}

function humanizeError(err) {
  const s = String(err || "").toLowerCase();

  if (s.includes("no route") || s.includes("no_route")) {
    return "No available route for this amount at the moment. Try a different size or pair.";
  }
  if (s.includes("amount too small") || s.includes("insufficient output amount")) {
    return "Trade size is below what routers will quote right now. Try a larger amount.";
  }
  if (s.includes("deadline") || s.includes("expired")) {
    return "This quote expired. Please refresh and try again.";
  }
  if (s.includes("user rejected")) {
    return "Transaction canceled in wallet.";
  }
  if (s.includes("condor_only")) {
    return "Private relay is available with Condor Wallet.";
  }
  return "Couldn’t complete that request. Please try again.";
}

async function sendWithPrivacy({ tx, account, usePrivateRelay, condor }: { tx: any; account: string; usePrivateRelay: boolean; condor?: CondorCtx }) {
  if (!usePrivateRelay || !condor) {
    const params: any = { from: account, to: tx.to, data: tx.data, value: tx.value };
    if (tx.gasLimit) params.gas = tx.gasLimit;
    const hash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [params],
    });
    return { hash, via: "public" };
  }

  const unsigned = await condor.signer.buildUnsignedLegacyTx(tx.to, tx.data, tx.value);
  if (tx.gasLimit) unsigned.gasLimit = tx.gasLimit;
  const raw = await condor.signer.signRaw(unsigned);
  const resp = await sendViaPrivateRelay(raw);
  return { hash: resp.txHash || null, via: "condor_private" };
}

export default function SafeSwap({ account, condor }: { account: string | null; condor?: CondorCtx | null }) {
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
  const [networkOk, setNetworkOk] = useState(true);
  const [usePrivateRelay, setUsePrivateRelay] = useState(false);
  const [relayReady, setRelayReady] = useState(false);

  const CHAIN_ID = CHAIN_BSC;
  const REFLECTION_SET = new Set(['0x092ac429b9c3450c9909433eb0662c3b7c13cf9a']);

  useEffect(() => {
    const involves = (!from.isNative && REFLECTION_SET.has(from.address.toLowerCase())) ||
                     (!to.isNative && REFLECTION_SET.has(to.address.toLowerCase()));
    setSlip(involves ? 300 : 200);
  }, [fromSym, toSym]);

  useEffect(() => {
    async function init() {
      try {
        const h = await fetchHealth();
        setRelayReady(!!h?.relayReady);
      } catch {
        setRelayReady(false);
      }
      try {
        const chain = await window.ethereum.request({ method: 'eth_chainId' });
        setNetworkOk(chain === '0x38');
      } catch {
        setNetworkOk(false);
      }
    }
    init();
  }, []);
  const canUseRelay = relayReady && !!condor;
  const useRelay = usePrivateRelay && canUseRelay;

  async function onGetQuote() {
    const seq = ++quoteSeq;
    inflight?.abort?.();
    inflight = new AbortController();

    try {
      setStatus('Fetching quote…');
      setQuote(null);
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
      setStatus('Quote ready');
      window.dispatchEvent(new Event("portfolio:refresh"));
  } catch (e) {
      if (seq !== quoteSeq) return;
      const raw = String(e?.message || e);
      logError("UI: Quote FAILED", { seq, err: raw });
      const msg = raw === 'amount_must_be_positive' ? 'Amount must be positive.' : humanizeError(raw);
      setStatus(msg);
      window.showToast?.(msg);
      console.error(e);
    }
  }

  async function onSwap() {
    setSwapping(true);
    try {
      if (!quote) return;
      if (usePrivateRelay && !canUseRelay) {
        const msg = "Private relay is available with Condor Wallet.";
        setStatus(msg);
        window.showToast?.(msg);
        return;
      }
      const fromToken = quote.sellToken;
      const toToken   = quote.buyToken;
      const amountIn  = quote.sellAmount;
      const minOut    = quote.minBuyAmount;
      const router    = quote.router;

      if (String(fromToken).toUpperCase() !== "BNB") {
        const appr = await buildApproveTx({ token: fromToken, owner: account, spender: router, amount: amountIn });
        if (appr.needed) {
          logInfo("Approve needed", appr);
          const txHash = await window.ethereum.request({
            method: "eth_sendTransaction",
            params: [{ from: account, to: appr.tx.to, data: appr.tx.data, value: appr.tx.value }]
          });
          logInfo("Approve tx sent", { txHash });
        } else {
          logInfo("Approve not needed");
        }
      }

      const swap = await buildSwapTx({
        fromToken,
        toToken,
        amountIn,
        minAmountOut: minOut,
        recipient: account
      });
      if (swap.ok === false) {
        const msg = swap.hint || 'Swap simulation failed.';
        setStatus(msg);
        window.showToast?.(msg);
        return;
      }
      const submit = await sendWithPrivacy({ tx: swap.tx, account, usePrivateRelay: useRelay, condor });
      logInfo("Swap submitted", submit);

      window.showToast?.("Swap submitted");
      window.dispatchEvent(new Event("swap:completed"));
      setTimeout(() => window.dispatchEvent(new Event("swap:completed")), 12_000);
      setTimeout(() => window.dispatchEvent(new Event("swap:completed")), 30_000);
    } catch (e) {
      const raw = String(e?.message || e);
      logError("Swap failed", raw);
      const msg = humanizeError(raw);
      setStatus(msg);
      window.showToast?.(msg);
    } finally {
      setSwapping(false);
    }
  }

  async function onMax(){
    try{
      let prov:any; let signerAddr:string;
      if (condor) {
        prov = condor.signer.provider;
        signerAddr = condor.address;
      } else {
        prov = new BrowserProvider(window.ethereum, 'any');
        signerAddr = (await prov.send('eth_requestAccounts', []))[0];
        if (!signerAddr) return;
      }
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
          GCC is a fee-on-transfer token. MetaMask may show a simulation warning; we set a safe gas limit and the on-chain cost is typically &lt;$0.50.
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
      {condor && canUseRelay ? (
        <div className="relayToggle" style={{marginTop:8}}>
          <label style={{display:'flex',alignItems:'center',gap:6}}>
            <input type="checkbox" checked={usePrivateRelay} onChange={e=>setUsePrivateRelay(e.target.checked)} />
            <span>Send privately (MEV-protected)</span>
          </label>
          <div className="muted">Private Relay: {usePrivateRelay ? 'ON' : 'OFF'} (MEV-protected via Condor)</div>
        </div>
      ) : (
        <div className="muted" style={{marginTop:8}}>Private routing is available in Condor Wallet.</div>
      )}
      {condor && canUseRelay && (
        <div className="muted" style={{marginTop:4}}>
          Condor Advantage: Transactions are submitted privately via relay to avoid public mempool exposure.
        </div>
      )}
      <button
        className="primary"
        disabled={!quote || swapping || !networkOk}
        aria-busy={swapping}
        onClick={onSwap}>
        {swapping ? 'Swapping…' : 'Swap'}
      </button>
    </>
  );
}
