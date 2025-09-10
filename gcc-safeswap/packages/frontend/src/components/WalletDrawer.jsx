import React, { useState } from 'react';
import DropZone from './DropZone.jsx';
import Fingerprint from './Fingerprint.jsx';
import { API_BASE } from '../lib/apiBase.js';

export default function WalletDrawer({ open, onClose }) {
  const [wallet, setWallet] = useState(null);
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');

  const [dpass, setDpass] = useState('');
  const [dfile, setDfile] = useState(null);
  const [decode, setDecode] = useState(null);
  const [dmsg, setDmsg] = useState('');

  if (!open) return null;

  const generate = async () => {
    setMessage('');
    const resp = await fetch(`${API_BASE}/api/wallet/generate`, { method: 'POST' });
    const data = await resp.json();
    if (resp.ok) setWallet(data);
    else setMessage(data.error || 'error');
  };

  const embed = async () => {
    if (!wallet || pass.length < 8 || pass !== confirm || !file) {
      setMessage('Check inputs');
      return;
    }
    const form = new FormData();
    form.append('handle', wallet.handle);
    form.append('passphrase', pass);
    form.append('image', file);
    const resp = await fetch(`${API_BASE}/api/wallet/embed`, { method: 'POST', body: form });
    if (!resp.ok) {
      const err = await resp.json();
      setMessage(err.error || 'error');
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `condor_wallet_${wallet.fingerprint}.png`;
    a.click();
    URL.revokeObjectURL(url);
    setWallet(null); setPass(''); setConfirm(''); setFile(null);
  };

  const decodeCall = async () => {
    if (dpass.length < 8 || !dfile) {
      setDmsg('Check inputs');
      return;
    }
    const form = new FormData();
    form.append('passphrase', dpass);
    form.append('image', dfile);
    const resp = await fetch(`${API_BASE}/api/wallet/decode`, { method: 'POST', body: form });
    const data = await resp.json();
    if (resp.ok) { setDecode(data); setDmsg(''); }
    else setDmsg(data.error || 'error');
  };

  return (
    <div className="wallet-drawer">
      <button onClick={onClose} style={{ float: 'right' }}>Close</button>
      <h2>Condor Wallet</h2>
      <section>
        <h3>Create & Embed</h3>
        <button onClick={generate}>Generate Wallet</button>
        {wallet && (
          <div>
            <div>Address: {wallet.address}</div>
            <Fingerprint value={wallet.fingerprint} />
          </div>
        )}
        <input type="password" placeholder="Passphrase" value={pass} onChange={(e)=>setPass(e.target.value)} />
        <input type="password" placeholder="Confirm" value={confirm} onChange={(e)=>setConfirm(e.target.value)} />
        <DropZone onFile={setFile} />
        <button onClick={embed}>Embed Key in Image</button>
        {message && <p className="error">{message}</p>}
      </section>
      <hr />
      <section>
        <h3>Decode</h3>
        <input type="password" placeholder="Passphrase" value={dpass} onChange={(e)=>setDpass(e.target.value)} />
        <DropZone onFile={setDfile} />
        <button onClick={decodeCall}>Decode</button>
        {dmsg && <p className="error">{dmsg}</p>}
        {decode && (
          <div>
            <div>Address: {decode.address}</div>
            <Fingerprint value={decode.fingerprint} />
          </div>
        )}
      </section>
    </div>
  );
}
