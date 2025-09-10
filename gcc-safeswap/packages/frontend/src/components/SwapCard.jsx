import React from 'react';
import SafeSwap from './SafeSwap.jsx';
import { connectInjected, ensureBscMainnet, metamaskDeepLink, connectCondor, getCondorProvider } from '../lib/wallet';

export default function SwapCard({ account, setAccount, onToggleLogs }) {

  async function connectHere() {
    try {
      const acc = await connectInjected();
      await ensureBscMainnet();
      setAccount(acc);
    } catch (e) {
      /* no-op */
    }
  }

  async function connectCondorWallet() {
    try {
      const acc = await connectCondor();
      await ensureBscMainnet(getCondorProvider() || (window as any).ethereum);
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
          <button className="btn ghost" onClick={connectCondorWallet}>Connect Condor</button>
        </div>
      )}

      <div className="form-row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onToggleLogs}>Show Logs</button>
      </div>

      <SafeSwap account={account} />
    </div>
  );
}
