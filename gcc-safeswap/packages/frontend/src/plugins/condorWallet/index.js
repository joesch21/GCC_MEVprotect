import React, { useState } from 'react';

export default function CondorWalletPane() {
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState('');

  async function onUpload() {
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    setMsg('Uploading…');
    try {
      const r = await fetch('/api/plugins/condor-wallet/upload', {
        method: 'POST',
        body: fd,
      });
      const j = await r.json();
      if (!r.ok) setMsg(`Error: ${j.error || r.statusText}`);
      else setMsg('Session ready (stub).');
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    }
  }

  return (
    <div>
      <p className="muted">Experimental. Do not upload secrets. Stub returns 501.</p>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <button className="btn" disabled={!file} onClick={onUpload}>
        Upload
      </button>
      {msg && (
        <div className="stat" style={{ marginTop: 8 }}>
          {msg}
        </div>
      )}
    </div>
  );
}

