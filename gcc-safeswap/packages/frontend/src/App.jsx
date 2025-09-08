import React, { useState, useEffect } from 'react';
import Connect from './components/Connect.jsx';
import SafeSwap from './components/SafeSwap.jsx';
import WalletUnlockModal from './components/WalletUnlockModal.jsx';
import useShieldStatus from './hooks/useShieldStatus.js';
import { ServerSigner } from './lib/serverSigner.js';

export default function App() {
  const [account, setAccount] = useState(null);
  const { shieldOn, refreshShield } = useShieldStatus();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [serverWallet, setServerWallet] = useState(null);
  const [useServer, setUseServer] = useState(false);

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.on('chainChanged', refreshShield);
    return () => { window.ethereum && window.ethereum.removeListener('chainChanged', refreshShield); };
  }, [refreshShield]);

  const activeAccount = useServer && serverWallet ? serverWallet.address : account;
  const signer = useServer && serverWallet ? new ServerSigner(serverWallet.sessionId, serverWallet.address) : null;

  return (
    <>
      <div className="bg-overlay"><div className="bg-matrix"></div></div>
      <nav className="nav">
        <div className="brand"><span className="logo">🜲</span><span>GCC SafeSwap</span></div>
        <ul className="nav__links">
          <li><a href="#">Docs</a></li>
          <li><a href="#">Staking</a></li>
          <li><a href="#">NFT Vault</a></li>
        </ul>
        <div className="nav__links">
          <Connect account={account} setAccount={setAccount} className="btn" />
          <button className="btn btn--primary" onClick={() => setUnlockOpen(true)}>Unlock Wallet</button>
          <span className={`pill ${shieldOn ? 'pill--success' : 'pill--warning'}`}>
            {shieldOn ? 'MEV-Shield ON' : 'MEV-Shield OFF'}
          </span>
        </div>
      </nav>
      <SafeSwap account={activeAccount} serverSigner={signer} />
      <WalletUnlockModal
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        onUnlocked={setServerWallet}
        onUseForSigning={setUseServer}
        onDestroy={() => setServerWallet(null)}
      />
      <footer className="footer">
        <div className="footer__inner">
          <span>© GCC 2025 — Making Volatility Great Again</span>
          <span>
            <a href="https://twitter.com">Twitter</a>
            <a href="https://discord.gg">Discord</a>
            <a href="#">Docs</a>
          </span>
        </div>
      </footer>
    </>
  );
}
