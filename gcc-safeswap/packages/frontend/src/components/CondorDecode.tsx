import { useCallback, useRef, useState } from "react";
import { ethers } from "ethers";

// Cache the WASM module once per session
let condorMod: any | null = null;
async function loadCondor() {
  if (condorMod) return condorMod;
  // Dynamic import; the module will fetch its own _bg.wasm
  // If your bundler complains, add this URL to allowed external imports.
  // @ts-ignore
  condorMod = await import("https://condor-encoder.onrender.com/pkg/condor_wallet.js");
  // Most wasm-pack bundles expose a default init(). If yours doesn’t need explicit init, this is a no-op.
  if (typeof condorMod.default === "function") {
    await condorMod.default(); // triggers WASM fetch if required
  }
  return condorMod;
}

type DecodeResult = { address: string; key: string }; // hex strings

export default function CondorDecode({
  onUnlocked,
  relayApi = "/api/relay/private" // Repo C relayer
}: {
  onUnlocked?: (r: DecodeResult) => void;
  relayApi?: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<DecodeResult | null>(null);

  const readFileBytes = (f: File) =>
    new Promise<Uint8Array>((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Failed to read file"));
      fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
      fr.readAsArrayBuffer(f);
    });

  const handleDecode = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      const f = fileRef.current?.files?.[0];
      if (!f) throw new Error("Please choose your Condor PNG");
      if (!pass) throw new Error("Enter your passphrase");

      const bytes = await readFileBytes(f);
      const condor = await loadCondor();

      // ---- IMPORTANT ----
      // Replace with the actual decode function name exported by your module.
      // Common patterns are: decode_png(bytes, passphrase) or decode(bytes, passphrase)
      // It must return { address, key } where `key` is 0x… private key (NEVER send to server).
      const { address, key } = (await condor.decode_png(bytes, pass)) as DecodeResult;

      // Basic shape validation
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("Bad address from decoder");
      if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Bad private key from decoder");

      setResult({ address, key });
      onUnlocked?.({ address, key });

      // Zero the passphrase from state ASAP
      setPass("");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [pass, onUnlocked]);

  // (Optional) sign locally & relay privately via Repo C backend
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
      if (!result?.key) throw new Error("Unlock your wallet first");
      // Use a throwaway local provider only for gas/nonce—DO NOT send with it.
      const jsonRpc = new ethers.providers.JsonRpcProvider(
        "https://bsc-dataseed.binance.org"
      ); // read-only
      const fromWallet = new ethers.Wallet(result.key, jsonRpc);

      // Fill in fields (legacy type 0 on BSC)
      const chainId = 56;
      const nonce =
        typeof unsignedTx.nonce === "number"
          ? unsignedTx.nonce
          : await jsonRpc.getTransactionCount(fromWallet.address, "latest");
      const gasPrice = unsignedTx.gasPrice
        ? ethers.BigNumber.from(unsignedTx.gasPrice)
        : await jsonRpc.getGasPrice();
      const estimate = await jsonRpc.estimateGas({
        from: fromWallet.address,
        to: unsignedTx.to,
        data: unsignedTx.data ?? "0x",
        value: unsignedTx.value ?? "0x0",
      });
      const gasLimit = ethers.BigNumber.from(
        unsignedTx.gasLimit || estimate
      )
        .mul(120)
        .div(100); // +20%

      const tx: ethers.utils.UnsignedTransaction = {
        to: unsignedTx.to,
        data: unsignedTx.data ?? "0x",
        value: unsignedTx.value ?? "0x0",
        gasLimit,
        gasPrice,
        nonce,
        chainId,
        type: 0, // legacy on BSC
      };

      // Sign locally (no broadcast)
      const raw = await fromWallet.signTransaction(tx);

      // Relay via your backend (Repo C)
      const r = await fetch(relayApi, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawTx: raw }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        throw new Error(`Relay failed: ${j?.error || r.status}`);
      }
      return j.result?.txHash || j.hash || null;
    },
    [result, relayApi]
  );

  return (
    <div className="card">
      <h3>Unlock Condor Wallet (local)</h3>
      <div className="row">
        <input
          ref={fileRef}
          type="file"
          accept="image/png"
          aria-label="Condor PNG"
        />
      </div>
      <div className="row">
        <input
          type="password"
          placeholder="Passphrase"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
      </div>
      <div className="row">
        <button disabled={busy} onClick={handleDecode}>
          {busy ? "Decoding…" : "Unlock"}
        </button>
      </div>

      {err && <div className="warn">{err}</div>}

      {result && (
        <div className="ok">
          <div>
            <strong>Address:</strong> {result.address}
          </div>
          {/* Don’t show the key in production UIs; keep it in memory only */}
          {/* <div><strong>Key:</strong> {result.key}</div> */}
        </div>
      )}

      {/* Example usage: sign & relay a prepared router tx */}
      {/* <button onClick={() => signAndRelay({ to: ROUTER, data, value: "0x0" })}>
        Send privately via Condor
      </button> */}
    </div>
  );
}

