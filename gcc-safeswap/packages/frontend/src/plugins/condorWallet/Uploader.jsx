import React, { useState } from 'react';
import { uploadImage, CondorServerSigner } from './api.js';

async function hashFile(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export default function Uploader({ onServerSigner, onUseServer }) {
  const [file, setFile] = useState(null);
  const [hash, setHash] = useState('');
  const [status, setStatus] = useState('');

  const onChange = async e => {
    const f = e.target.files?.[0];
    setFile(f);
    if (f) setHash((await hashFile(f)).slice(0,8));
    else setHash('');
  };

  const onSubmit = async e => {
    e.preventDefault();
    if (!file) return;
    setStatus('Uploading...');
    try {
      const { sessionId, address } = await uploadImage(file);
      const signer = new CondorServerSigner(sessionId, address);
      onServerSigner && onServerSigner(signer);
      onUseServer && onUseServer(true);
      setStatus('Unlocked');
    } catch (err) {
      setStatus(err.message || 'error');
    }
  };

  return (
    <form onSubmit={onSubmit} className="stack" style={{gap:8}}>
      <input type="file" accept="image/png,image/jpeg" onChange={onChange} />
      {file && (
        <div className="muted">{file.name} • {file.size} bytes • {hash}</div>
      )}
      <button type="submit" disabled={!file}>Upload</button>
      {status && <div className="status">{status}</div>}
    </form>
  );
}
