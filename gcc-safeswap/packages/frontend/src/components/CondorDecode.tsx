import { useCallback, useRef, useState } from "react";
import { ethers } from "ethers";
import { decodePngToPrivateKey, privateKeyToWallet } from "../lib/condor/condor";

type Props = {
  onUnlocked?: (r: { address: string; key: string }) => void;
};

function getProvider() {
  const url = (import.meta as any)?.env?.VITE_BSC_RPC ?? "https://bscrpc.pancakeswap.finance";
  // @ts-ignore
  if (ethers?.providers?.JsonRpcProvider) return new (ethers as any).providers.JsonRpcProvider(url); // v5
  // @ts-ignore
  return new (ethers as any).JsonRpcProvider(url); // v6
}

async function toPngBytes(f: File): Promise<Uint8Array> {
  if (!/image\/png/i.test(f.type)) {
    const sig = new Uint8Array(await f.slice(0, 8).arrayBuffer());
    const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!pngMagic.every((b, i) => sig[i] === b)) throw new Error("Selected file is not a PNG");
  }
  return new Uint8Array(await f.arrayBuffer());
}

export default function CondorDecode({ onUnlocked }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  const handleDecode = useCallback(async () => {
    setErr(null); setBusy(true);
    try {
      const f = fileRef.current?.files?.[0];
      if (!f) throw new Error("Choose your Condor PNG");
      if (!pass) throw new Error("Enter your passphrase");

      // Decode → key
      const key = await decodePngToPrivateKey(await toPngBytes(f), pass);

      // Build wallet just to surface address
      const provider = getProvider();
      const wallet = privateKeyToWallet(key, provider);

      setAddress(wallet.address);
      setPass("");
      onUnlocked?.({ address: wallet.address, key });
      console.info("[Condor] Wallet unlocked:", wallet.address);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [pass, onUnlocked]);

  return (
    <div className="card">
      <h3>Unlock Condor Wallet (local)</h3>

      <div className="row">
        <input ref={fileRef} type="file" accept="image/png" aria-label="Condor PNG" />
      </div>

      <div className="row">
        <input
          type="password"
          placeholder="Passphrase"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete="current-password"
        />
      </div>

      <div className="row">
        <button disabled={busy} onClick={handleDecode}>
          {busy ? "Decoding…" : "Unlock"}
        </button>
      </div>

      {err && <div className="warn">⚠️ {err}</div>}
      {address && <div className="ok"><strong>Address:</strong> {address}</div>}
    </div>
  );
}
