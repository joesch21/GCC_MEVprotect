import React from 'react';
import { usePortfolio } from '../hooks/usePortfolio';

export default function TopBar({ account }) {
  const { totalUsd, bnb, gcc, stale } = usePortfolio(account);

  const fmtUsd = (n) =>
    n <= 0 ? "$0.0000" :
    (n < 1 ? `$${n.toFixed(4)}` : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);

  const fmtToken = (n, dec) => account ? n.toFixed(dec) : '—';

  return (
    <div className="topbar badges-row">
      <BalancePill symbol="BNB" amount={fmtToken(bnb, 4)} />
      <BalancePill symbol="GCC" amount={fmtToken(gcc, 2)} />
      <PortfolioPill usd={fmtUsd(totalUsd)} stale={stale} />
      <RefreshButton onClick={() => window.dispatchEvent(new Event('portfolio:refresh'))} />
    </div>
  );
}

function BalancePill({ symbol, amount }) {
  return (
    <div className="pill">
      {symbol} {amount}
    </div>
  );
}

function PortfolioPill({ usd, stale }) {
  return (
    <div className="pill">
      Portfolio {usd}
      {stale && <span className="muted" style={{ marginLeft: 4 }}>↻ last price</span>}
    </div>
  );
}

function RefreshButton({ onClick }) {
  return (
    <button className="btn tiny" onClick={onClick}>↻</button>
  );
}
