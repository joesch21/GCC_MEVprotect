import React, { useState } from 'react';
import SafeSwap from './SafeSwap.jsx';
import { connectInjected, ensureBscMainnet, metamaskDeepLink } from '../lib/wallet';

export default function SwapCard({ onToggleLogs, onOpenSettings }) {
  const [account, setAccount] = useState(null);

  async function connectHere() {
    try {
      const acc = await connectInjected();
      await ensureBscMainnet();
      setAccount(acc);
    } catch (e) {
      /* no-op */
    }
  }

  return (
    <div className="card">
      {!account && (
        <div className="form-row" style={{ justifyContent: 'space-between' }}>
          <button className="btn" onClick={connectHere}>Connect MetaMask</button>
          <button className="btn ghost" onClick={() => window.open(metamaskDeepLink(), '_blank')}>
            Open in MetaMask App
          </button>
        </div>
      )}

      <SafeSwap account={account} />
      <div className="form-row">
        <button className="btn ghost" onClick={onToggleLogs}>Show Logs</button>
        <button className="btn ghost" onClick={onOpenSettings}>Settings</button>
      </div>
    </div>
  );
}
