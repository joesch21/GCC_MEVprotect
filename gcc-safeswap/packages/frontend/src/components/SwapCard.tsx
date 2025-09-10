import React from 'react';
import SafeSwap from './SafeSwap.jsx';
import { connectInjected, connectCondor } from '../lib/wallet';

interface SwapCardProps {
  account: string | null;
  setAccount: React.Dispatch<React.SetStateAction<string | null>>;
  onToggleLogs: () => void;
}

export default function SwapCard({ account, setAccount, onToggleLogs }: SwapCardProps) {

  async function connectHere() {
    try {
      const acc = await connectInjected();
      setAccount(acc);
    } catch (e) {
      /* no-op */
    }
  }

  async function connectCondorWallet() {
    try {
      const acc = await connectCondor();
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
