import React, { useState } from 'react';
import DropZone from './DropZone.jsx';
import Fingerprint from './Fingerprint.jsx';

export default function WalletUnlockModal({ open, onClose, onUnlocked, onUseForSigning, onDestroy }) {
  const [file, setFile] = useState(null);
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState('');
  const [wallet, setWallet] = useState(null);
  const [useSigner, setUseSigner] = useState(false);

  if (!open) return null;

  const unlock = async () => {
    setMsg('');
    if (!file || pass.length < 8) {
      setMsg('Check inputs');
      return;
    }
    const form = new FormData();
    form.append('image', file);
    form.append('passphrase', pass);
    const resp = await fetch('/api/wallet/unlock', { method: 'POST', body: form });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      setMsg(data.error || 'error');
      return;
    }
    setWallet(data);
    onUnlocked && onUnlocked(data);
  };

  const toggleUse = (e) => {
    const v = e.target.checked;
    setUseSigner(v);
    onUseForSigning && onUseForSigning(v);
  };

  const destroy = async () => {
    if (wallet) {
      await fetch('/api/wallet/destroy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: wallet.sessionId }) });
    }
    setWallet(null);
    setFile(null);
    setPass('');
    setUseSigner(false);
    onUseForSigning && onUseForSigning(false);
    onDestroy && onDestroy();
  };

  return (
    <div className="modal">
      <div className="card stack">
        <button onClick={onClose} style={{ alignSelf: 'flex-end' }}>Close</button>
        <h2>Unlock Condor Wallet</h2>
        <input type="password" placeholder="Passphrase" value={pass} onChange={e => setPass(e.target.value)} />
        <DropZone onFile={setFile} />
        <button className="primary" onClick={unlock}>Unlock</button>
        {msg && <p className="error">{msg}</p>}
        {wallet && (
          <div className="stack">
            <p>Unlocked • {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}</p>
            <Fingerprint value={wallet.fingerprint} />
            <label>
              <input type="checkbox" checked={useSigner} onChange={toggleUse} /> Use as Signing Wallet
            </label>
            <button onClick={destroy}>Lock &amp; Destroy</button>
          </div>
        )}
      </div>
    </div>
  );
}
