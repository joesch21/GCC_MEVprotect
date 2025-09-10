import React from 'react';

export default function TopBar() {
  return (
    <div className="topbar">
      <BalancePill symbol="BNB" amount="0.0019" />
      <BalancePill symbol="GCC" amount="589.12" />
      <PortfolioPill usd="$0.00" />
      <button className="btn tiny" onClick={() => {}}>↻</button>
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
