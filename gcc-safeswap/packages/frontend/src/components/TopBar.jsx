import React from 'react';
import { usePortfolio } from '../hooks/usePortfolio';

export default function TopBar({ account }) {
  const { totalUsd, bnb, gcc, bnbUsd, gccUsd, stale, updatedAt } = usePortfolio(account);

  const fmtUsd = (n) => {
    if (bnbUsd === 0 && gccUsd === 0) return "$0.00";
    return n < 1 ? `$${n.toFixed(4)}` : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const fmtToken = (n, dec) => account ? n.toFixed(dec) : '—';

  return (
    <div className="topbar badges-row">
      <BalancePill symbol="BNB" amount={fmtToken(bnb, 4)} />
      <BalancePill symbol="GCC" amount={fmtToken(gcc, 2)} />
      <PortfolioPill usd={fmtUsd(totalUsd)} />
      {stale ? (
        <div className="badge">Using last price • tap ⟳ to refresh</div>
      ) : (
        <div className="badge">↻ last updated {new Date(updatedAt).toLocaleTimeString()}</div>
      )}
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

function PortfolioPill({ usd }) {
  return <div className="pill">Portfolio {usd}</div>;
}

function RefreshButton({ onClick }) {
  return (
    <button className="btn tiny" onClick={onClick}>↻</button>
  );
}
