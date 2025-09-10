import React from 'react';
import { HeaderBadge } from './HeaderBadge.tsx';

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
        <HeaderBadge account={account} />
      </div>
    </header>
  );
}
