import React, { useState, useEffect } from 'react';
import AppHeader from './components/AppHeader.jsx';
import TopBar from './components/TopBar.jsx';
import SwapCard from './components/SwapCard.tsx';
import DebugDrawer from './components/DebugDrawer.jsx';
import WalletUnlockModal from './components/WalletUnlockModal.jsx';
import SettingsDrawer from './components/SettingsDrawer.jsx';
import { WalletConnect } from './components/WalletConnect.tsx';
import useShieldStatus from './hooks/useShieldStatus.js';
import { ServerSigner } from './lib/serverSigner.js';
import { getBrowserProvider } from './lib/ethers.js';

export default function App() {
  const [account, setAccount] = useState(null);
  const { refreshShield } = useShieldStatus();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [serverSigner, setServerSigner] = useState(null);
  const [useServer, setUseServer] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  async function refreshAccount() {
    try {
      const prov = getBrowserProvider();
      const acc = await prov.send('eth_accounts', []);
      setAccount(acc?.[0] || null);
    } catch {}
  }

  useEffect(() => {
    (async () => { await refreshAccount(); })();

    if (!window.ethereum) return;
    const onAccountsChanged = a => setAccount(a?.[0] || '');
    window.ethereum.on('accountsChanged', onAccountsChanged);
    window.ethereum.on('chainChanged', refreshShield);
    return () => {
      window.ethereum.removeListener('accountsChanged', onAccountsChanged);
      window.ethereum.removeListener('chainChanged', refreshShield);
    };
  }, [refreshShield]);

  return (
    <>
      <div className="shell">
        <AppHeader
          openSettings={() => setSettingsOpen(true)}
          account={account}
        />
        <TopBar account={account} />
        <main className="main">
          <section className="left">
            <WalletConnect onConnected={refreshAccount} />
            <SwapCard
              account={account}
              setAccount={setAccount}
              onToggleLogs={() => setLogsOpen(v => !v)}
            />
          </section>
          <aside className="right">
            <DebugDrawer open={logsOpen} toggleLogs={() => setLogsOpen(false)} />
          </aside>
        </main>
      </div>

      <WalletUnlockModal
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        onUnlocked={w => setServerSigner(new ServerSigner(w.sessionId, w.address))}
        onUseForSigning={setUseServer}
        onDestroy={() => setServerSigner(null)}
      />

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
