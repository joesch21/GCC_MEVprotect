import { useCallback, useRef, useState } from "react";
import { ethers } from "ethers";
import { decodePngToPrivateKey, privateKeyToWallet } from "../lib/condor/condor";

/** ---------- Types ---------- */
type Props = {
  onUnlocked?: (r: { address: string; key: string }) => void; // if parent needs key (session-only)
  relayApi?: string; // if you later enable relaying
};

/** ---------- Helpers ---------- */
function getProvider() {
  const url =
    (import.meta as any)?.env?.VITE_BSC_RPC ?? "https://bsc-dataseed.binance.org";
  // v5 vs v6
  // @ts-ignore
  if (ethers?.providers?.JsonRpcProvider) return new (ethers as any).providers.JsonRpcProvider(url);
  // @ts-ignore
  return new (ethers as any).JsonRpcProvider(url);
}

/** ---------- Component ---------- */
export default function CondorDecode({
  onUnlocked,
  relayApi = "/api/relay/private",
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const walletRef = useRef<ethers.Wallet | null>(null);

  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  const handleDecode = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      const f = fileRef.current?.files?.[0];
      if (!f) throw new Error("Choose your Condor PNG");
      if (!pass) throw new Error("Enter your passphrase");

      // 1) Decode → private key (0x + 64 hex)
      let key = await decodePngToPrivateKey(f, pass);

      // 2) Build signer and attach provider
      const provider = getProvider();
      const wallet = privateKeyToWallet(key, provider);
      walletRef.current = wallet;

      // 3) Clear sensitive strings ASAP
      setPass("");
      // do NOT store key in React state
      setAddress(wallet.address);

      // Inform parent if it needs to stash the key in a session store
      onUnlocked?.({ address: wallet.address, key });

      console.info("[Condor] Wallet unlocked:", wallet.address);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [pass, onUnlocked]);

  // Optional future relay usage (kept for wiring; not invoked by default).
  const signAndRelay = useCallback(
    async (unsignedTx: {
      to: string;
      data?: string;
      value?: string;
      gasLimit?: string;
      gasPrice?: string;
      nonce?: number;
      chainId?: number;
    }) => {
      const signer = walletRef.current;
      if (!signer) throw new Error("Unlock your wallet first");

      const provider = signer.provider!;
      const from = signer.address;
      const chainId = 56; // BSC

      const est = await provider.estimateGas({
        from,
        to: unsignedTx.to,
        data: unsignedTx.data ?? "0x",
        value: unsignedTx.value ?? "0x0",
      });

      // +20% buffer (supports v6 bigint; v5 BigNumber also works via as any)
      const gasLimit =
        (typeof (est as any).mul === "function"
          ? (est as any).mul(120).div(100)
          : (BigInt(est as any) * 120n) / 100n) as any;

      const [gasPrice, nonce] = await Promise.all([
        provider.getGasPrice(),
        typeof unsignedTx.nonce === "number"
          ? unsignedTx.nonce
          : provider.getTransactionCount(from, "latest"),
      ]);

      const tx: any = {
        to: unsignedTx.to,
        data: unsignedTx.data ?? "0x",
        value: unsignedTx.value ?? "0x0",
        gasLimit,
        gasPrice,
        nonce,
        chainId,
        type: 0, // legacy on BSC
      };

      const raw = await signer.signTransaction(tx);

      const r = await fetch(relayApi, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawTx: raw }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) {
        throw new Error(`Relay failed: ${j?.error || r.status}`);
      }
      return j?.result?.txHash || j?.hash || null;
    },
    [relayApi]
  );

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

      {address && (
        <div className="ok">
          <div><strong>Address:</strong> {address}</div>
          {/* Private key stays only in walletRef; not in state or DOM */}
        </div>
      )}

      {/* Example future usage:
      <button onClick={() => signAndRelay({ to: ROUTER, data, value: "0x0" })}>
        Send privately via Condor
      </button> */}
    </div>
  );
}

/** Small utility (keep if other components want a 1-call unlock) */
export async function unlockFromPng(file: File, pass: string) {
  let pk = await decodePngToPrivateKey(file, pass); // uses condor.ts
  const provider = new ethers.JsonRpcProvider(
    (import.meta as any)?.env?.VITE_BSC_RPC || "https://bscrpc.pancakeswap.finance"
  );
  const wallet = privateKeyToWallet(pk, provider); // ethers.Wallet
  pk = ""; // clear string ASAP
  return wallet;
}
