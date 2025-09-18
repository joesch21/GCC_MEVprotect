import { ethers } from "ethers";

/** ---------------- logger bridge (uses your UI logger if present) ---------------- */
function uiLog(message: string, ctx?: Record<string, any>) {
  const line = ctx ? `${message} ${safeJson(ctx)}` : message;
  try { (window as any).addLog?.(line); } catch {}
  try { (window as any).log?.(line); } catch {}
  try { (window as any).__pushLog?.(line); } catch {}
  // eslint-disable-next-line no-console
  console.info(line);
}
function safeJson(x: any) {
  try { return JSON.stringify(x); } catch { return "[unserializable]"; }
}

/** ---------------- Types from the wasm bundle (loose to be compatible) ---------------- */
type CondorWasm = {
  default?: (wasm?: string | { module_or_path: string }) => Promise<any> | any;

  // known decode variants
  decode_png?: (png: Uint8Array, pass: string) => Promise<any> | any;
  wallet_from_image_with_password?: (png: Uint8Array, pass: string) => Promise<any> | any;
  decode_wallet_from_image?: (png: Uint8Array, pass: string) => Promise<any> | any;
  wallet_from_key?: (png: Uint8Array, pass: string) => Promise<any> | any;

  [k: string]: any;
};

let condorReady: Promise<CondorWasm> | null = null;

/** ---------------- Absolute same-origin URLs (no env, no remotes) ---------------- */
const JS_URL   = new URL("/pkg/condor_encoder.js", location.origin).toString();
const WASM_URL = new URL("/pkg/condor_encoder_bg.wasm", location.origin).toString();

/** Initialize and cache the wasm module. Supports multiple init signatures. */
export function loadCondorWallet(): Promise<CondorWasm> {
  if (condorReady) return condorReady;

  condorReady = (async () => {
    uiLog("[Condor] loading wasm module", { jsUrl: JS_URL, wasmUrl: WASM_URL });

    const mod: any = await import(/* @vite-ignore */ `${JS_URL}?v=${Date.now()}`);

    if (typeof mod.default === "function") {
      try {
        await mod.default(WASM_URL);
      } catch {
        try {
          await mod.default({ module_or_path: WASM_URL });
        } catch {
          await mod.default();
        }
      }
    }

    try {
      const keys = Object.keys(mod || {});
      const fnKeys = keys.filter((k) => typeof (mod as any)[k] === "function");
      uiLog("[Condor] wasm exports available", { keys, functions: fnKeys });
    } catch {}

    return mod as CondorWasm;
  })();

  return condorReady;
}

/** ---------------- Small helpers ---------------- */
function ensure0x64(key: string): string {
  if (!key) throw new Error("Decode failed (empty key)");
  const k = key.startsWith("0x") ? key : `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error("Decode failed (invalid key)");
  return k;
}

function toBytes(input: File | ArrayBuffer | Uint8Array): Promise<Uint8Array> | Uint8Array {
  if (input instanceof Uint8Array) return input.slice(); // new buffer
  if (input instanceof File) return input.arrayBuffer().then((ab) => new Uint8Array(ab));
  return new Uint8Array(input); // ArrayBuffer
}

function safeParse(raw: any): any {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

function extractKey(out: any): string | null {
  if (!out) return null;
  let key: string | undefined =
    out.key ?? out.private_key ?? out?.result?.key ?? out?.result?.private_key;
  if (typeof out === "string") key = out;
  if (!key) {
    try {
      const s = JSON.stringify(out);
      const m = s.match(/"(0x)?([0-9a-fA-F]{64})"/);
      if (m?.[2]) key = (m[1] ? `${m[1]}${m[2]}` : `0x${m[2]}`);
    } catch {}
  }
  return key ? ensure0x64(key) : null;
}

/** Try a candidate function safely and return a key if it works. */
async function tryDecoder(fnName: string, fn: any, bytes: Uint8Array, pass: string): Promise<string | null> {
  if (typeof fn !== "function") return null;
  try {
    const raw = await fn(bytes, pass);
    const out = safeParse(raw);
    const key = extractKey(out);
    if (key) {
      uiLog("[Condor] decode succeeded via", { fnName });
      return key;
    }
    uiLog("[Condor] decode returned no key", { fnName, typeof: typeof raw });
  } catch (e: any) {
    uiLog("[Condor] decode attempt failed", { fnName, error: String(e?.message || e) });
  }
  return null;
}

/** Decode a Condor PNG + passphrase → normalized hex private key (0x…) */
export async function decodePngToPrivateKey(
  png: File | ArrayBuffer | Uint8Array,
  passphrase: string
): Promise<string> {
  const mod = await loadCondorWallet();
  const bytes = await toBytes(png);

  const ordered: Array<[string, any]> = [
    ["decode_png", (mod as any).decode_png],
    ["wallet_from_image_with_password", (mod as any).wallet_from_image_with_password],
    ["decode_wallet_from_image", (mod as any).decode_wallet_from_image],
    ["wallet_from_key", (mod as any).wallet_from_key],
  ];

  for (const [name, fn] of ordered) {
    const key = await tryDecoder(name, fn, bytes, passphrase);
    if (key) return key;
  }

  const candidates = Object.entries(mod)
    .filter(([k, v]) => typeof v === "function" && /decode|wallet/i.test(k))
    .filter(([k]) => !ordered.find(([n]) => n === k));

  if (candidates.length) {
    uiLog("[Condor] trying discovered decoder candidates", { candidates: candidates.map(([k]) => k) });
  }

  for (const [name, fn] of candidates) {
    const key = await tryDecoder(name, fn, bytes, passphrase);
    if (key) return key;
  }

  try {
    const fnKeys = Object.keys(mod).filter((k) => typeof (mod as any)[k] === "function");
    uiLog("[Condor] decoder exports not found", { tried: ordered.map(([n]) => n), functions: fnKeys });
  } catch {}
  throw new Error(
    "Decoder exports not found (tried: decode_png, wallet_from_image_with_password, decode_wallet_from_image, wallet_from_key)"
  );
}

/** Build an ethers Wallet from a private key. Works with v5 or v6 providers. */
export function privateKeyToWallet(pk: string, provider: any): ethers.Wallet {
  const normalized = pk.startsWith("0x") ? pk : `0x${pk}`;
  // @ts-ignore — v5/v6 compatible
  return new (ethers as any).Wallet(normalized, provider);
}
