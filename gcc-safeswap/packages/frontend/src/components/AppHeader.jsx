import React from 'react';

export default function AppHeader({ openSettings, toggleLogs, account }) {
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
        <button className="btn ghost" onClick={toggleLogs}>
          <i className="icon-terminal" /> Show Logs
        </button>
        <div className="divider" />
        <NetworkBadge />
        <WalletChip account={account} />
      </div>
    </header>
  );
}

function NetworkBadge() {
  return <div className="pill">BNB • Private RPC</div>;
}

function WalletChip({ account }) {
  const display = account ? `${account.slice(0, 6)}…${account.slice(-4)}` : 'Connect';
  return <div className="pill">{display}</div>;
}
