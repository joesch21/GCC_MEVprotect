// packages/frontend/src/components/CondorDecode.tsx
import { useCallback, useRef, useState } from "react";
import { ethers } from "ethers";

/** ---------- Types ---------- */
type DecodeOut = { address: string; key: string }; // hex strings (0x-prefixed)
type WalletModule = {
  // wasm-pack init export (varies by template)
  default?: (wasm?: string | { module_or_path: string }) => Promise<any> | any;

  // possible decode exports
  decode_png?: (bytes: Uint8Array, pass: string) => Promise<DecodeOut> | DecodeOut;
  wallet_from_image_with_password?: (bytes: Uint8Array, pass: string) => string | DecodeOut;
};

type Props = {
  onUnlocked?: (r: DecodeOut) => void;
  relayApi?: string; // if you later enable relaying
};

/** ---------- Loader (same-origin first; env override optional) ---------- */
let cachedMod: WalletModule | null = null;

async function loadCondorModule(): Promise<WalletModule> {
  if (cachedMod) return cachedMod;

  // Prefer same-origin encoder bundle; allow env overrides if needed
  const jsUrl =
    (import.meta as any)?.env?.VITE_CONDOR_WALLET_JS_URL ??
    "/pkg/condor_encoder.js";

  const wasmUrl =
    (import.meta as any)?.env?.VITE_CONDOR_WALLET_WASM_URL ??
    "/pkg/condor_encoder_bg.wasm";

  // Log once so Network errors are easy to trace
  console.info("[Condor] loading wasm module", { jsUrl, wasmUrl });

  // Dynamic ESM import; prevent Vite from prebundling
  const mod: WalletModule = await import(/* @vite-ignore */ `${jsUrl}?v=${Date.now()}`);

  // Support both init signatures: init(wasmUrl) or init({ module_or_path })
  if (typeof mod.default === "function") {
    try {
      await mod.default(wasmUrl);
    } catch {
      await mod.default({ module_or_path: wasmUrl });
    }
  }

  cachedMod = mod;
  return mod;
}

/** ---------- Small helpers ---------- */
function assertHex(re: RegExp, s: string, msg: string) {
  if (!re.test(s)) throw new Error(msg);
}

async function fileToBytesPNG(f: File): Promise<Uint8Array> {
  if (!f.type || !/image\/png/i.test(f.type)) {
    // not all browsers set type; also check signature
    const sig = new Uint8Array(await f.slice(0, 8).arrayBuffer());
    const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const looksPNG = pngMagic.every((b, i) => sig[i] === b);
    if (!looksPNG) throw new Error("Selected file is not a PNG");
  }
  const buf = await f.arrayBuffer();
  return new Uint8Array(buf);
}

function getProvider() {
  // ethers v5 vs v6 compatibility
  const url =
    (import.meta as any)?.env?.VITE_BSC_RPC ?? "https://bsc-dataseed.binance.org";
  // @ts-ignore
  if (ethers?.providers?.JsonRpcProvider) {
    // v5
    // @ts-ignore
    return new ethers.providers.JsonRpcProvider(url);
  }
  // v6
  // @ts-ignore
  return new ethers.JsonRpcProvider(url);
}

/** ---------- Component ---------- */
export default function CondorDecode({
  onUnlocked,
  relayApi = "/api/relay/private",
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<DecodeOut | null>(null);

  const handleDecode = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      const f = fileRef.current?.files?.[0];
      if (!f) throw new Error("Choose your Condor PNG");
      if (!pass) throw new Error("Enter your passphrase");

      const bytes = await fileToBytesPNG(f);
      const mod = await loadCondorModule();

      let address = "";
      let key = "";

      // Try both common exports
      if (typeof mod.decode_png === "function") {
        const out = await mod.decode_png(bytes, pass) as any;
        address = out?.address ?? "";
        key = out?.key ?? out?.private_key ?? "";
      } else if (typeof mod.wallet_from_image_with_password === "function") {
        const raw = await mod.wallet_from_image_with_password(bytes, pass);
        const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw as any);
        address = parsed.address || parsed.addr || "";
        key = parsed.private_key || parsed.key || "";
      } else {
        throw new Error("Decoder exports not found (decode_png / wallet_from_image_with_password).");
      }

      assertHex(/^0x[0-9a-fA-F]{40}$/, address, "Decoder returned an invalid address");
      assertHex(/^0x[0-9a-fA-F]{64}$/, key, "Decoder returned an invalid private key");

      const provider = getProvider();
      // @ts-ignore (v5 or v6 both accept this)
      const wallet = new ethers.Wallet(key, provider);

      setResult({ address, key });
      setPass(""); // clear passphrase ASAP
      onUnlocked?.({ address, key });

      // NOTE: do not log the key; keep only in memory state
      console.info("[Condor] Wallet unlocked:", address);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [pass, onUnlocked]);

  // Optional future relay usage (kept for wiring; not invoked)
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
      const provider = getProvider();
      // @ts-ignore
      const fromWallet = new ethers.Wallet(result.key, provider);

      const chainId = 56; // BSC
      // v5 BigNumber vs v6 bigint — normalize via provider
      // @ts-ignore
      const currentNonce =
        typeof unsignedTx.nonce === "number"
          ? unsignedTx.nonce
          : await provider.getTransactionCount(fromWallet.address, "latest");

      // @ts-ignore
      const currentGasPrice =
        unsignedTx.gasPrice
          // @ts-ignore
          ? (ethers.BigNumber?.from?.(unsignedTx.gasPrice) ?? unsignedTx.gasPrice)
          : await provider.getGasPrice();

      const est = await provider.estimateGas({
        from: fromWallet.address,
        to: unsignedTx.to,
        data: unsignedTx.data ?? "0x",
        value: unsignedTx.value ?? "0x0",
      });

      // +20% buffer
      // @ts-ignore
      const gasLimit = (ethers.BigNumber?.from?.(unsignedTx.gasLimit || est) ?? est)
        // @ts-ignore
        .mul?.(120)
        // @ts-ignore
        .div?.(100) ?? est;

      // ethers v5 type:
      // @ts-ignore
      const tx: ethers.utils.UnsignedTransaction = {
        to: unsignedTx.to,
        data: unsignedTx.data ?? "0x",
        value: unsignedTx.value ?? "0x0",
        gasLimit,
        gasPrice: currentGasPrice,
        nonce: currentNonce,
        chainId,
        type: 0, // legacy on BSC
      };

      const raw = await fromWallet.signTransaction(tx as any);

      const r = await fetch(relayApi, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawTx: raw }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || (j && j.ok === false)) {
        throw new Error(`Relay failed: ${j?.error || r.status}`);
      }
      return j?.result?.txHash || j?.hash || null;
    },
    [result, relayApi]
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

      {result && (
        <div className="ok">
          <div><strong>Address:</strong> {result.address}</div>
          {/* Never display or send the private key; keep ephemeral in RAM */}
        </div>
      )}

      {/* Example future usage:
      <button onClick={() => signAndRelay({ to: ROUTER, data, value: "0x0" })}>
        Send privately via Condor
      </button> */}
    </div>
  );
}
