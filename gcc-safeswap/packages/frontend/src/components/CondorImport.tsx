// packages/frontend/src/components/CondorImport.tsx
import React, { useState } from "react";
import { decodePngToPrivateKey } from "../lib/condor";
import { useCondorPrivateKey } from "../lib/signer";

export default function CondorImport() {
  const [pk, setPk] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");

  async function onImportPk(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!pk.trim()) throw new Error("Enter private key");
      useCondorPrivateKey(pk.trim());
      setMsg("Loaded Condor signer from private key (session only)");
      setPk("");
    } catch (err: any) {
      setMsg(err.message || String(err));
    }
  }

  async function onDecodePng(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!file) throw new Error("Choose a PNG");
      const key = await decodePngToPrivateKey(file, pass);
      useCondorPrivateKey(key);
      setMsg("Decoded and loaded Condor signer (session only)");
      setFile(null);
      setPass("");
    } catch (err: any) {
      setMsg(err.message || String(err));
    }
  }

  return (
    <div className="condor-import">
      <h3>🔓 Condor Wallet (trial-wallet)</h3>

      <form onSubmit={onImportPk} style={{ marginBottom: 12 }}>
        <input
          type="password"
          placeholder="Private key (0x...)"
          value={pk}
          onChange={(e) => setPk(e.target.value)}
          style={{ width: "100%" }}
        />
        <button type="submit" style={{ marginTop: 8 }}>Use Private Key</button>
      </form>

      <form onSubmit={onDecodePng}>
        <input type="file" accept="image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <input
          type="password"
          placeholder="Passphrase"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          style={{ display: "block", marginTop: 8 }}
        />
        <button type="submit" style={{ marginTop: 8 }}>Decode PNG → Use Signer</button>
      </form>

      {msg && <p style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>{msg}</p>}
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
        Keys are kept in memory only for this tab. Never paste production keys here.
      </p>
    </div>
  );
}
