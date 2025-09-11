import React from 'react';
import SafeSwap from './SafeSwap';
import { connectInjected } from '../lib/wallet';
import { isMetaMaskEnv } from '../lib/walletDetect';

interface SwapCardProps {
  account: string | null;
  setAccount: React.Dispatch<React.SetStateAction<string | null>>;
  onToggleLogs: () => void;
  condor?: any;
}

export default function SwapCard({ account, setAccount, onToggleLogs, condor }: SwapCardProps) {

  async function connectHere() {
    try {
      const acc = await connectInjected();
      setAccount(acc);
    } catch (e) {
      /* no-op */
    }
  }

  const hasMetaMask = isMetaMaskEnv();
  const canConnect = hasMetaMask;

  return (
    <div className="card">
      {!account && canConnect && (
        <div className="form-row" style={{ justifyContent: 'space-between' }}>
          {hasMetaMask && (
            <button className="btn" onClick={connectHere}>Connect MetaMask</button>
          )}
        </div>
      )}

      <div className="form-row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onToggleLogs}>Show Logs</button>
      </div>

      <SafeSwap account={account} condor={condor} />
    </div>
  );
}
