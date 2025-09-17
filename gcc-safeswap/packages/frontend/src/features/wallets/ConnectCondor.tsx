// gcc-safeswap/packages/frontend/src/features/wallets/ConnectCondor.tsx
import { useRef, useState } from "react";
import { decodeFromPng } from "../../lib/condor/encoder";
import { CondorSigner } from "../../lib/condor/signer";

type Props = {
  onConnected: (ctx: { address: string; signer: CondorSigner }) => void;
};

export default function ConnectCondor({ onConnected }: Props) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  // Prefer VITE_BSC_RPC; fall back to VITE_PUBLIC_BSC_RPC if present
  const RPC =
    (import.meta.env.VITE_BSC_RPC as string | undefined) ??
    (import.meta.env.VITE_PUBLIC_BSC_RPC as string | undefined);

  const canSubmit = !!RPC && !busy;

  async function handleUnlock() {
    try {
      setBusy(true);
      setErr(undefined);

      if (!RPC) throw new Error("Missing VITE_BSC_RPC (or VITE_PUBLIC_BSC_RPC).");

      const f = fileRef.current?.files?.[0];
      if (!f) throw new Error("Choose a PNG file.");
      if (!pass) throw new Error("Enter your passphrase.");

      const png = new Uint8Array(await f.arrayBuffer());

      // decodeFromPng must return { address, key }
      const res = await decodeFromPng(png, pass);
      const address: string | undefined = res?.address;
      let key: string | undefined = res?.key;

      if (!address || !key) throw new Error("Decode failed (no address or key returned).");

      // Normalize private key to 0x-prefixed hex
      if (!key.startsWith("0x")) key = `0x${key}`;

      // Build signer using provided RPC
      const signer = new CondorSigner(key, RPC);

      onConnected({ address, signer });
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm opacity-70">
        <div><strong>RPC:</strong> {RPC ?? "— not set —"}</div>
      </div>

      <input
        type="file"
        accept="image/png"
        ref={fileRef}
        className="block w-full"
      />

      <input
        type="password"
        value={pass}
        placeholder="Passphrase"
        onChange={(e) => setPass(e.target.value)}
        className="block w-full p-3 rounded bg-neutral-800"
        autoComplete="current-password"
      />

      <button
        className="px-4 py-3 rounded bg-white text-black disabled:opacity-50"
        disabled={!canSubmit}
        title={!RPC ? "Missing VITE_BSC_RPC" : undefined}
        onClick={handleUnlock}
      >
        {busy ? "Unlocking…" : "Unlock Condor"}
      </button>

      {err && <div className="text-red-400 text-sm">{err}</div>}

      <p className="text-xs text-neutral-500">
        Keys never leave your browser. Use “Forget Wallet” to clear memory.
      </p>
    </div>
  );
}
