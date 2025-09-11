import { useRef, useState } from "react";
import { decodeFromPng } from "../../lib/condor/encoder";
import { CondorSigner } from "../../lib/condor/signer";

export default function ConnectCondor({ onConnected }:{ onConnected: (ctx:{ address:string, signer: CondorSigner })=>void }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <input type="file" accept="image/png" ref={fileRef} className="block w-full" />
      <input type="password" value={pass} placeholder="Passphrase" onChange={e=>setPass(e.target.value)} className="block w-full p-3 rounded bg-neutral-800" />
      <button className="px-4 py-3 rounded bg-white text-black disabled:opacity-50" disabled={busy} onClick={async ()=>{
        try {
          setBusy(true); setErr(undefined);
          const f = fileRef.current?.files?.[0]; if (!f) throw new Error("Choose a PNG");
          const png = new Uint8Array(await f.arrayBuffer());
          const { address, key } = await decodeFromPng(png, pass);
          const signer = new CondorSigner(key, import.meta.env.VITE_PUBLIC_BSC_RPC as string);
          onConnected({ address, signer });
        } catch (e:any) { setErr(e?.message || String(e)); } finally { setBusy(false); }
      }}>
        {busy ? "Unlocking…" : "Unlock Condor"}
      </button>
      {err && <div className="text-red-400 text-sm">{err}</div>}
      <p className="text-xs text-neutral-500">Keys never leave your browser. Use “Forget Wallet” to clear memory.</p>
    </div>
  );
}
