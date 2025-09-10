import React, { useState } from 'react';
import { connectInjected, ensureBscMainnet, metamaskDeepLink } from '../lib/wallet';

export default function AppHeader({ openSettings, toggleLogs }) {
  const [account, setAccount] = useState(null);

  async function onConnectBrowser() {
    try {
      const acc = await connectInjected();
      await ensureBscMainnet();
      setAccount(acc);
    } catch (e) {
      console.info(String(e));
    }
  }

  const onConnectMobile = () => {
    window.open(metamaskDeepLink(), '_blank');
  };

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
        {!account ? (
          <div className="connect-row">
            <button className="btn" onClick={onConnectBrowser}>Connect MetaMask</button>
            <button className="btn ghost" onClick={onConnectMobile}>Open in MetaMask App</button>
          </div>
        ) : (
          <WalletChip address={account} />
        )}
      </div>
    </header>
  );
}

function WalletChip({ address }) {
  const display = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return <div className="pill">{display}</div>;
}
