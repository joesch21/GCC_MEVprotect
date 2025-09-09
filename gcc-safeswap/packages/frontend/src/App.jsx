import React, { useState, useEffect, useCallback } from 'react';
import Connect from './components/Connect.jsx';
import SafeSwap from './components/SafeSwap.jsx';
import WalletUnlockModal from './components/WalletUnlockModal.jsx';
import useShieldStatus from './hooks/useShieldStatus.js';
import { ServerSigner } from './lib/serverSigner.js';
import { getBrowserProvider } from './lib/ethers.js';
import LogTail from "./components/LogTail.jsx";
import SettingsDrawer from './components/SettingsDrawer.jsx';

export default function App() {
  const [perfMode, setPerfMode] = useState(() => localStorage.getItem("perfMode") === "1");
  const [account, setAccount] = useState(null);
  const { shieldOn, refreshShield } = useShieldStatus();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [serverSigner, setServerSigner] = useState(null);
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

  // Respect OS "Reduce Motion" on first visit
  useEffect(() => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced && localStorage.getItem("perfMode") == null) {
      setPerfMode(true);
      localStorage.setItem("perfMode", "1");
    }
  }, []);

  // Toggle body class for CSS switches
  useEffect(() => {
    document.documentElement.classList.toggle("perf-mode", !!perfMode);
    if (perfMode) localStorage.setItem("perfMode", "1");
    else localStorage.removeItem("perfMode");
  }, [perfMode]);

  const togglePerf = useCallback(() => setPerfMode(v => !v), []);

  useEffect(() => {
    if (window.location.pathname === "/swap") {
      const el = document.getElementById("swap");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const activeAccount = useServer && serverSigner ? serverSigner._address : account;
  const signer = useServer && serverSigner ? serverSigner : null;

  return (
    <>
      <div className="bg-overlay"><div className="bg-matrix" /></div>

      <header className="nav">
        <div className="nav__inner container">
          <a href="/" className="brand brand--neon" aria-label="GCC SafeSwap Home">
            <span>GCC SafeSwap</span>
          </a>
          <nav className="nav__links" aria-label="Primary">
            <a href="/dashboard">Dashboard</a>
            <a href="/stake">Stake</a>
            <a href="/swap" className="pill pill--accent">Swap</a>
          </nav>
          <div className="nav__right">
            <button className="btn" onClick={togglePerf} aria-pressed={perfMode}>
              {perfMode ? "Performance Mode: ON" : "Performance Mode: OFF"}
            </button>
            <Connect />
          </div>
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
            <img src="/assets/no_mask.png" alt="Condor" className="condor-visual" />
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
        onUnlocked={w => setServerSigner(new ServerSigner(w.sessionId, w.address))}
        onUseForSigning={setUseServer}
        onDestroy={() => setServerSigner(null)}
      />

      <SettingsDrawer onServerSigner={setServerSigner} onUseServer={setUseServer} />

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
