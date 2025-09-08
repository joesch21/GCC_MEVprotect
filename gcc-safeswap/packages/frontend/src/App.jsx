import React, { useState, useEffect } from 'react';
import Connect from './components/Connect.jsx';
import SafeSwap from './components/SafeSwap.jsx';
import WalletUnlockModal from './components/WalletUnlockModal.jsx';
import useShieldStatus from './hooks/useShieldStatus.js';
import { ServerSigner } from './lib/serverSigner.js';
import { getBrowserProvider } from './lib/ethers.js';
import LogTail from "./components/LogTail.jsx";

export default function App() {
  const [account, setAccount] = useState(null);
  const { shieldOn, refreshShield } = useShieldStatus();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [serverWallet, setServerWallet] = useState(null);
  const [useServer, setUseServer] = useState(false);
  const scrollToSwap = () => {
    document
      .getElementById("swap")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    (async () => {
      try {
        const prov = getBrowserProvider();
        const acc = await prov.send('eth_accounts', []);
        if (acc?.[0]) setAccount(acc[0]);
        prov.on('accountsChanged', a => setAccount(a?.[0] || ''));
      } catch {}
    })();
    if (!window.ethereum) return;
    window.ethereum.on('chainChanged', refreshShield);
    return () => { window.ethereum && window.ethereum.removeListener('chainChanged', refreshShield); };
  }, [refreshShield]);

  useEffect(() => {
    if (window.location.pathname === "/swap") {
      const el = document.getElementById("swap");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const activeAccount = useServer && serverWallet ? serverWallet.address : account;
  const signer = useServer && serverWallet ? new ServerSigner(serverWallet.sessionId, serverWallet.address) : null;

  return (
    <>
      <div className="bg-overlay"><div className="bg-matrix" /></div>

      <header className="nav">
        <div className="nav__inner container">
          <a href="/" className="brand" aria-label="GCC SafeSwap Home">
            <img src="/assets/logo.jpeg" alt="Condor Logo" className="logo" />
            <span>GCC SafeSwap</span>
          </a>
          <div className="nav__links">
            <a href="/dashboard">Dashboard</a>
            <a href="/stake">Stake</a>
            <a href="/swap" className="pill pill--accent">Swap</a>
          </div>
          <Connect />
        </div>
      </header>

      <section className="hero container">
        <div className="hero__copy">
          <h1><span className="glow">SafeSwap</span> for Condorians</h1>
          <p className="lead">Private, MEV-protected swaps with Apple-style simplicity.</p>
          <div className="cta">
            <button className="btn btn--primary" onClick={scrollToSwap}>Start Swapping</button>
          </div>
        </div>
        {/* <div className="hero__visual">
          <div className="holo">
            <img src="/assets/matrix.png" alt="Condor" className="condor-visual" />
          </div>
        </div> */}
      </section>

      <main>
        <section id="swap" className="holo">
          <div className="card">
            <SafeSwap account={activeAccount} serverSigner={signer} />
          </div>
        </section>
      </main>
      <LogTail />

      <WalletUnlockModal
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        onUnlocked={setServerWallet}
        onUseForSigning={setUseServer}
        onDestroy={() => setServerWallet(null)}
      />

      <footer className="footer">
        <div className="footer__inner container">
          <span>© {new Date().getFullYear()} Condor Capital — Making Volatility Great Again</span>
          <nav>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
          </nav>
        </div>
      </footer>

    </>
  );
}
