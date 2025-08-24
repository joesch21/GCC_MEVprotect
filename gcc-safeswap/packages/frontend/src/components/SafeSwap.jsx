import React, { useState } from 'react';
import TOKENS from '../lib/tokens-bsc';
import { parseAmount, formatAmount } from '../lib/format';
import { getSigner, Contract, MaxUint256, getBurner } from '../lib/ethers';

const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export default function SafeSwap({ account }) {
  const tokenList = Object.values(TOKENS);
  const [mode, setMode] = useState('rpc');
  const [from, setFrom] = useState(TOKENS.BNB.address);
  const [to, setTo] = useState(TOKENS.GCC.address);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(50);
  const [quote, setQuote] = useState(null);
  const [status, setStatus] = useState('');

  const tokenFor = (addr) => tokenList.find(t => t.address === addr);

  const getQuote = async () => {
    try {
      const sellAmount = parseAmount(amount, tokenFor(from).decimals).toString();
      if (mode === '0x') {
        const qs = new URLSearchParams({
          chainId: '56',
          sellToken: from,
          buyToken: to,
          sellAmount,
          taker: account || '',
          slippageBps: slippage
        });
        const resp = await fetch(`/api/0x/quote?${qs.toString()}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.validationErrors?.[0]?.reason || data.reason || 'quote error');
        setQuote(data);
        setStatus('');
      } else if (mode === 'apeswap') {
        const routeResp = await fetch(`/api/apeswap/route?${new URLSearchParams({ sellToken: from, buyToken: to })}`);
        const routeData = await routeResp.json();
        const resp = await fetch(`/api/apeswap/amountsOut?${new URLSearchParams({ sellToken: from, buyToken: to, amountIn: sellAmount })}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'quote error');
        setQuote({ buyAmount: data.amounts[data.amounts.length - 1], path: routeData.path });
        setStatus('');
      }
    } catch (e) {
      setStatus(e.message);
    }
  };

  const swapMetaMask = async () => {
    if (!quote) return;
    try {
      const signer = await getSigner();
      let allowanceTarget = quote.allowanceTarget;
      let txRequest = { to: quote.to, data: quote.data, value: BigInt(quote.value || '0') };
      if (mode === 'apeswap') {
        const sellAmount = parseAmount(amount, tokenFor(from).decimals).toString();
        const minOut = (BigInt(quote.buyAmount) * BigInt(10000 - slippage)) / BigInt(10000);
        const build = await fetch('/api/apeswap/buildTx', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ from: account, sellToken: from, buyToken: to, amountIn: sellAmount, minAmountOut: minOut.toString() })
        });
        const buildData = await build.json();
        allowanceTarget = buildData.to;
        txRequest = { to: buildData.to, data: buildData.data, value: BigInt(buildData.value || '0') };
      }
      if (from !== NATIVE) {
        const token = new Contract(from, ['function allowance(address owner,address spender) view returns(uint256)','function approve(address spender,uint256) returns (bool)'], signer);
        const allowance = await token.allowance(account, allowanceTarget);
        if (allowance < BigInt(parseAmount(amount, tokenFor(from).decimals))) {
          const txA = await token.approve(allowanceTarget, MaxUint256);
          await txA.wait();
        }
      }
      const tx = await signer.sendTransaction(txRequest);
      setStatus(tx.hash);
    } catch (e) {
      setStatus(e.message);
    }
  };

  const swapRelay = async () => {
    if (!quote) return;
    try {
      const wallet = getBurner();
      let txRequest = { to: quote.to, data: quote.data, value: BigInt(quote.value || '0'), chainId: 56 };
      if (mode === 'apeswap') {
        const sellAmount = parseAmount(amount, tokenFor(from).decimals).toString();
        const minOut = (BigInt(quote.buyAmount) * BigInt(10000 - slippage)) / BigInt(10000);
        const build = await fetch('/api/apeswap/buildTx', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ from: wallet.address, sellToken: from, buyToken: to, amountIn: sellAmount, minAmountOut: minOut.toString() })
        });
        const buildData = await build.json();
        txRequest = { to: buildData.to, data: buildData.data, value: BigInt(buildData.value || '0'), chainId: 56 };
      }
      const signed = await wallet.signTransaction(txRequest);
      const resp = await fetch('/api/relay/sendRaw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rawTx: signed })
      });
      const data = await resp.json();
      setStatus(data.result || data.error || '');
    } catch (e) {
      setStatus(e.message);
    }
  };

  return (
    <div className="card">
      <div>
        Mode:
        <select value={mode} onChange={e => setMode(e.target.value)}>
          <option value="rpc">Private RPC (shielded send)</option>
          <option value="0x">0x RFQ + shielded send</option>
          <option value="apeswap">ApeSwap Router (direct LP)</option>
        </select>
        <span className="badge">SAFE</span>
      </div>
      <div>
        From:
        <select value={from} onChange={e => setFrom(e.target.value)}>
          {tokenList.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
        </select>
      </div>
      <div>
        To:
        <select value={to} onChange={e => setTo(e.target.value)}>
          {tokenList.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
        </select>
      </div>
      <div>
        Amount:
        <input value={amount} onChange={e => setAmount(e.target.value)} />
      </div>
      <div>
        Slippage (bps):
        <input type="number" min="0" max="500" value={slippage} onChange={e => setSlippage(e.target.value)} />
      </div>
      <button onClick={getQuote}>Get Quote</button>
      {quote && (
        <div>
          <p>Buy Amount: {formatAmount(BigInt(quote.buyAmount), tokenFor(to).decimals)}</p>
          {quote.sources && <p className="route-chip">Route: {quote.sources.filter(s => parseFloat(s.proportion) > 0).map(s => s.name).join(' → ')}</p>}
          {quote.path && <p className="route-chip">Route: {quote.path.map(p => tokenFor(p)?.symbol || '').join(' → ')} (ApeSwap)</p>}
        </div>
      )}
      <button onClick={swapMetaMask}>Swap (MetaMask • Private RPC)</button>
      <button onClick={swapRelay}>Swap (Embedded • Server Relay)</button>
      {status && <p>{status}</p>}
    </div>
  );
}
