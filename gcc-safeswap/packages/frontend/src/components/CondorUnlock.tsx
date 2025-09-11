import { useRef, useState } from "react";
import { ethers } from "ethers";

let mod: any;
async function loadDecoder() {
  if (mod) return mod;
  // @ts-ignore
  mod = await import("https://condor-encoder.onrender.com/pkg/condor_wallet.js");
  if (typeof mod.default === "function") await mod.default();
  return mod;
}

export default function CondorUnlock({ onReady }:{ onReady:(res:{address:string; wallet:ethers.Wallet})=>void }) {
  const fileRef = useRef<HTMLInputElement|null>(null);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  const readBytes = (f: File) => new Promise<Uint8Array>((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error("file read error"));
    fr.onload = () => res(new Uint8Array(fr.result as ArrayBuffer));
    fr.readAsArrayBuffer(f);
  });

  const onUnlock = async () => {
    try {
      setErr(null); setBusy(true);
      const f = fileRef.current?.files?.[0];
      if (!f) throw new Error("Choose Condor PNG");
      if (!pass) throw new Error("Enter passphrase");
      const bytes = await readBytes(f);
      const m = await loadDecoder();
      const { address, key } = await m.decode_png(bytes, pass);
      if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Bad decode result");
      const provider = new ethers.providers.JsonRpcProvider("https://bsc-dataseed.binance.org");
      const wallet = new ethers.Wallet(key, provider);
      setPass("");
      onReady({ address, wallet });
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3>Unlock Condor Wallet (local)</h3>
      <input ref={fileRef} type="file" accept="image/png" aria-label="Condor PNG" />
      <input type="password" placeholder="Passphrase" value={pass} onChange={e => setPass(e.target.value)} />
      <button onClick={onUnlock} disabled={busy}>{busy ? "Decoding…" : "Unlock"}</button>
      {err && <div className="warn">{err}</div>}
    </div>
  );
}
