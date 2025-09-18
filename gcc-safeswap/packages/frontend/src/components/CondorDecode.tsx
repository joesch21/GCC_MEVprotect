// packages/frontend/src/components/CondorDecode.tsx
import { useCallback, useRef, useState } from "react";
import { ethers } from "ethers";
import { decodePngToPrivateKey, privateKeyToWallet } from "../lib/condor/condor";

type Props = {
  /** Optional: parent can capture the session key (don’t persist!) */
  onUnlocked?: (r: { address: string; key: string }) => void;
  /** Optional: private relay endpoint */
  relayApi?: string;
};

/* ---------------- provider / compat helpers ---------------- */

function getProvider() {
  const url =
    (import.meta as any)?.env?.VITE_BSC_RPC ?? "https://bsc-dataseed.binance.org";
  // ethers v5:
  // @ts-ignore
  if (ethers?.providers?.JsonRpcProvider) return new (ethers as any).providers.JsonRpcProvider(url);
  // ethers v6:
  // @ts-ignore
  return new (ethers as any).JsonRpcProvider(url);
}

/** Works on v5 (BigNumber) and v6 (bigint); falls back to raw RPC */
async function getGasPriceCompat(p: any): Promise<any> {
  if (typeof p?.getGasPrice === "function") return p.getGasPrice();      // v5
  const fd = await p?.getFeeData?.();                                     // v6
  if (fd?.gasPrice != null) return fd.gasPrice;
  const hex = await p?.send?.("eth_gasPrice", []);                        // raw
  return typeof hex === "string" ? BigInt(hex) : hex;
}

/* ---------------- component ---------------- */

export default function CondorDecode({ onUnlocked, relayApi = "/api/relay/private" }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const walletRef = useRef<ethers.Wallet | null>(null); // signer lives only in RAM

  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  const handleDecode = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("Choose your Condor PNG");
      if (!pass) throw new Error("Enter your passphrase");

      // 1) Decode → private key "0x…"
      let key = await decodePngToPrivateKey(file, pass);

      // 2) Create signer + attach provider
      const provider = getProvider();
      const wallet = privateKeyToWallet(key, provider);
      walletRef.current = wallet;

      // 3) Clear sensitive strings ASAP
      setPass("");
      key = ""; // encourage GC

      setAddress(wallet.address);
      onUnlocked?.({ address: wallet.address, key: wallet.privateKey ?? "" });

      console.info("[Condor] Wallet unlocked:", wallet.address);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [pass, onUnlocked]);

  /** Optional: sign locally and relay for broadcast (gasless/private send) */
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

      const provider: any = signer.provider ?? getProvider();
      const from = signer.address;
      const chainId = unsignedTx.chainId ?? 56; // BSC default

      // estimate gas
      const est = await provider.estimateGas({
        from,
        to: unsignedTx.to,
        data: unsignedTx.data ?? "0x",
        value: unsignedTx.value ?? "0x0",
      });

      // +20% buffer (v6 bigint or v5 BigNumber)
      const gasLimit =
        typeof (est as any).mul === "function"
          ? (est as any).mul(120).div(100)                     // v5 BigNumber
          : (BigInt(est as any) * 120n) / 100n;                // v6 bigint

      const [gasPrice, nonce] = await Promise.all([
        unsignedTx.gasPrice
          ? // allow hex/decimal; prefer BigNumber when available
            (ethers as any).BigNumber?.from?.(unsignedTx.gasPrice) ?? BigInt(unsignedTx.gasPrice)
          : getGasPriceCompat(provider),
        typeof unsignedTx.nonce === "number"
          ? unsignedTx.nonce
          : provider.getTransactionCount(from, "latest"),
      ]);

      // value may be hex, decimal string, or omitted
      const value =
        unsignedTx.value != null
          ? (typeof (ethers as any).getBigInt === "function"
              ? (ethers as any).getBigInt(unsignedTx.value)
              : BigInt(unsignedTx.value))
          : (typeof (ethers as any).toBeHex === "function" ? 0 : 0n);

      const tx: any = {
        to: unsignedTx.to,
        data: unsignedTx.data ?? "0x",
        value,
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
      if (!r.ok || j?.ok === false) throw new Error(`Relay failed: ${j?.error || r.status}`);
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
          {/* Private key stays in walletRef only (not in state/DOM) */}
        </div>
      )}

      {/* Example future usage:
      <button onClick={() => signAndRelay({ to: ROUTER, data, value: "0x0" })}>
        Send privately via Condor
      </button> */}
    </div>
  );
}

/** small exported helper for other components */
export async function unlockFromPng(file: File, pass: string) {
  let pk = await decodePngToPrivateKey(file, pass);
  const provider = new ethers.JsonRpcProvider(
    (import.meta as any)?.env?.VITE_BSC_RPC || "https://bscrpc.pancakeswap.finance"
  );
  const wallet = privateKeyToWallet(pk, provider);
  pk = ""; // clear ASAP
  return wallet;
}
// robustDecode.ts
export function extractKeyMaybe(obj: any): string | null {
  const HEX64 = /^0x?[0-9a-fA-F]{64}$/;
  const norm = (s: string) => (s.startsWith("0x") ? s : `0x${s}`);

  // 1) direct hex key?
  const str = obj?.key ?? obj?.private_key ?? obj?.privKey ?? obj?.privateKey;
  if (typeof str === "string" && HEX64.test(str)) return norm(str);

  // 2) 32-byte arrays / array-likes (key_bytes, private_key_bytes, etc.)
  const bytes =
    obj?.key_bytes ?? obj?.private_key_bytes ?? obj?.secret_key ?? obj?.seckey ?? obj?.pk ?? null;

  const asArrayLike =
    bytes && typeof bytes === "object" && typeof bytes.length === "number" && bytes.length === 32;

  if (asArrayLike) {
    let out = "0x";
    for (let i = 0; i < 32; i++) {
      const n = Number(bytes[i]) & 0xff;
      out += n.toString(16).padStart(2, "0");
    }
    return HEX64.test(out) ? out : null;
  }

  // 3) generic string that might be JSON or contain hex
  if (typeof obj === "string") {
    try {
      const j = JSON.parse(obj);
      return extractKeyMaybe(j);
    } catch {
      const m = obj.match(/0x?[0-9a-fA-F]{64}/);
      return m ? norm(m[0]) : null;
    }
  }

  // 4) unwrap common wrappers and search nested
  for (const k of ["Ok", "ok", "value", "result"]) {
    if (obj && typeof obj === "object" && k in obj) {
      const r = extractKeyMaybe((obj as any)[k]);
      if (r) return r;
    }
  }
  if (obj && typeof obj === "object") {
    for (const v of Object.values(obj)) {
      const r = extractKeyMaybe(v);
      if (r) return r;
    }
  }
  return null;
}

export async function decodeViaWalletExport(png: File | ArrayBuffer, pass: string): Promise<string> {
  const js = "/pkg/condor_encoder.js";
  const wasm = "/pkg/condor_encoder_bg.wasm";
  const mod: any = await import(/* @vite-ignore */ `${js}?v=${Date.now()}`);
  await mod.default?.({ module_or_path: wasm });

  const bytes = png instanceof File ? new Uint8Array(await png.arrayBuffer()) : new Uint8Array(png);

  // call exactly like the trial page
  const val = mod.wallet_from_image_with_password(bytes, pass);
  const obj = typeof val === "string" ? JSON.parse(val) : val;

  const key = extractKeyMaybe(obj);
  if (!key) throw new Error("Decode returned object without a private key");
  return key;
}
