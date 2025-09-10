import React, { useState, useEffect } from 'react';
import { ethers, BrowserProvider, Contract } from 'ethers';
import { TOKENS, CHAIN_BSC } from '../lib/tokens';
import { getQuote as fetchQuote, buildApproveTx, buildSwapTx, health as fetchHealth } from '../lib/api';
import { fromBase, toBase } from '../lib/format';
import { logInfo, logError, logWarn, clearLogs } from '../lib/logger.js';
import TokenSelect from './TokenSelect.jsx';
import { detectCaps } from '../lib/walletCaps';
import { getCondorProvider } from '../lib/wallet';

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
    return "Private relay is available with Condor Wallet. On MetaMask, use a Private RPC instead.";
  }
  return "Couldn’t complete that request. Please try again.";
}

async function sendWithPrivacy({ tx, account, usePrivateRelay, rpcIsPrivate }) {
  if (!usePrivateRelay) {
    const hash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: account, to: tx.to, data: tx.data, value: tx.value }],
    });
    return { hash, via: rpcIsPrivate ? "private_rpc" : "public" };
  }

  const condor = getCondorProvider() || window.ethereum;
  const provider = new BrowserProvider(condor, 'any');
  const chainId = (await provider.getNetwork()).chainId;
  const nonce = await provider.getTransactionCount(account, "latest");
  const gasPrice = await provider.getGasPrice();
  const gas = await provider.estimateGas({ from: account, to: tx.to, data: tx.data, value: tx.value });

  const unsigned = {
    to: tx.to,
    data: tx.data,
    value: ethers.BigNumber.from(tx.value || "0x0").toHexString(),
    gas: gas.mul(120).div(100).toHexString(),
    gasPrice: gasPrice.toHexString(),
    nonce: ethers.hexlify(nonce),
    chainId: Number(chainId),
    type: 0,
  };

  const raw = await condor.request({
    method: "eth_signTransaction",
    params: [unsigned],
  });

  const resp = await fetch(`${import.meta.env.VITE_API_BASE}/api/relay/private`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rawTx: raw }),
  }).then((r) => r.json());

  if (!resp?.ok) throw new Error("Private relay failed");

  return { hash: resp.result?.txHash || resp.result?.hash || null, via: "condor_private" };
}

export default function SafeSwap({ account }) {
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
  const [lastParams, setLastParams] = useState(null);
  const [rpcLabel, setRpcLabel] = useState('');
  const [rpcUrl, setRpcUrl] = useState('');
  const [usePrivateRelay, setUsePrivateRelay] = useState(false);
  const [relayReady, setRelayReady] = useState(false);
  const [{ isMetaMask, isCondor }, setCaps] = useState({ isMetaMask: false, isCondor: false });

  const CHAIN_ID = CHAIN_BSC;
  const REFLECTION_SET = new Set(['0x092ac429b9c3450c9909433eb0662c3b7c13cf9a']);

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
      const cfg = window.ethereum?._state?.providerConfig;
      const lbl = cfg?.nickname || cfg?.chainName || '';
      const url = cfg?.rpcUrl || '';
      setRpcLabel(lbl);
      setRpcUrl(url);
      setCaps(detectCaps(window.ethereum, window));
    }
    init();
    const onChainChanged = () => {
      const cfg = window.ethereum?._state?.providerConfig;
      const lbl = cfg?.nickname || cfg?.chainName || '';
      const url = cfg?.rpcUrl || '';
      setRpcLabel(lbl);
      setRpcUrl(url);
      setCaps(detectCaps(window.ethereum, window));
    };
    window.ethereum?.on('chainChanged', onChainChanged);
    return () => window.ethereum?.removeListener('chainChanged', onChainChanged);
  }, []);
  const rpcIsPrivate = /\b(private|mev|flash|blxr)\b/i.test(rpcLabel || rpcUrl || '');
  const canUseRelay = relayReady && isCondor;
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
      setLastParams({ sellAmount });
      setStatus('Quote ready');
      window.refreshPortfolioValue?.();
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
        const msg = "Private relay is available with Condor Wallet. On MetaMask, use a Private RPC instead.";
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
      const submit = await sendWithPrivacy({ tx: swap.tx, account, usePrivateRelay: useRelay, rpcIsPrivate });
      logInfo("Swap submitted", submit);

      window.showToast?.("Swap submitted");
      setTimeout(() => window.refreshPortfolioValue?.(), 12_000);
      setTimeout(() => window.refreshPortfolioValue?.(), 30_000);
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
      <div className="row" style={{marginTop:8}}>
        {rpcIsPrivate ? (
          <div className="badge success">Private RPC: ON</div>
        ) : canUseRelay ? (
          <label style={{display:'flex',alignItems:'center',gap:6}}>
            <input type="checkbox" checked={usePrivateRelay} onChange={e=>setUsePrivateRelay(e.target.checked)} />
            <span>Send privately (MEV-protected) — via Condor Relay</span>
          </label>
        ) : (
          <>
            <div className="badge">Public RPC</div>
            {isMetaMask && (
              <small style={{opacity:.8, marginLeft:8}}>
                MetaMask users: use Settings → “Add Private RPC” for MEV protection.
              </small>
            )}
          </>
        )}
      </div>
      {isCondor && canUseRelay && (
        <div className="muted" style={{marginTop:4}}>
          Condor Advantage: Transactions are submitted privately via relay to avoid public mempool exposure.
        </div>
      )}
      {isMetaMask && !rpcIsPrivate && (
        <div className="muted" style={{marginTop:4}}>
          Tip: Add a Private RPC in Settings to route your swaps privately.
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
