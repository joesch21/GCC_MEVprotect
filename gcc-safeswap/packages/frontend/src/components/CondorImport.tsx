// packages/frontend/src/components/CondorImport.tsx
import React, { useRef, useState } from "react";
import { decodePngToPrivateKey } from "../lib/condor/condor";
import { useCondorPrivateKey } from "../lib/condor/signer";

export default function CondorImport() {
  const [pk, setPk] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function resetFileInput() {
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onImportPk(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setMsg("");
    try {
      if (!pk.trim()) throw new Error("Enter a private key");
      useCondorPrivateKey(pk.trim());
      setMsg("Loaded Condor signer from private key (session only).");
      setPk("");
    } catch (err: any) {
      setMsg(err?.message || String(err));
    }
  }

  async function onDecodePng(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setMsg("");
    try {
      const file = fileRef.current?.files?.[0] ?? null;
      if (!file) throw new Error("Choose a PNG first");
      if (!pass) throw new Error("Enter your passphrase");
      setBusy(true);

      const key = await decodePngToPrivateKey(file, pass);
      useCondorPrivateKey(key);

      setMsg("Decoded and loaded Condor signer (session only).");
      resetFileInput();
      setPass("");
    } catch (err: any) {
      setMsg(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="condor-import">
      <h3>🔓 Condor Wallet (local)</h3>

      <form onSubmit={onImportPk} style={{ marginBottom: 12 }}>
        <input
          type="password"
          placeholder="Private key (0x...)"
          value={pk}
          onChange={(e) => setPk(e.target.value)}
          style={{ width: "100%" }}
          autoComplete="current-password"
        />
        <button type="submit" style={{ marginTop: 8 }} disabled={busy}>
          {busy ? "Loading…" : "Use Private Key"}
        </button>
      </form>

      <form onSubmit={onDecodePng}>
        <input ref={fileRef} type="file" accept="image/png" aria-label="Condor PNG" />
        <input
          type="password"
          placeholder="Passphrase"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          style={{ display: "block", marginTop: 8 }}
          autoComplete="current-password"
        />
        <button type="submit" style={{ marginTop: 8 }} disabled={busy}>
          {busy ? "Decoding…" : "Decode PNG → Use Signer"}
        </button>
      </form>

      {msg && <p style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>{msg}</p>}
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
        Keys are kept in memory only for this tab. Never paste production keys here.
      </p>
    </div>
  );
}
