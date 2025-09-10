import React from 'react';
import SafeSwap from './SafeSwap.jsx';

export default function SwapCard({ account, onToggleLogs, onOpenSettings }) {
  return (
    <div className="card">
      <SafeSwap account={account} />
      <div className="form-row">
        <button className="btn ghost" onClick={onToggleLogs}>Show Logs</button>
        <button className="btn ghost" onClick={onOpenSettings}>Settings</button>
      </div>
    </div>
  );
}
