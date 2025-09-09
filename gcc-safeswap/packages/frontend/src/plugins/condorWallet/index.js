import React from 'react';
import Uploader from './Uploader.jsx';

export default function CondorWalletPlugin({ onClose, onServerSigner, onUseServer }) {
  return (
    <div className="card stack" style={{gap:8}}>
      <h3>Condor Wallet <span className="badge" style={{background:'red'}}>Experimental</span></h3>
      <p className="muted">No keys leave your device except encrypted payloads.</p>
      <Uploader onServerSigner={onServerSigner} onUseServer={onUseServer} />
      <button onClick={onClose}>Close</button>
    </div>
  );
}
