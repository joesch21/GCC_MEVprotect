import React from 'react';

export default function AppHeader({ openSettings, account }) {
  
  return (
    <header className="header">
      <div className="brand">
        <span className="dot" />
        <strong>GCC SafeSwap</strong>
        <small>for Condorians</small>
      </div>
      <div className="header-actions">
        <button className="btn ghost" onClick={openSettings}>
          <i className="icon-settings" /> Settings
        </button>
        <div className="divider" />
        {account && <WalletChip address={account} />}
      </div>
    </header>
  );
}

function WalletChip({ address }) {
  const display = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return <div className="pill">{display}</div>;
}
