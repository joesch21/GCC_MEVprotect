// encoder.ts — same-origin loader + robust wrapper
// Place this file in: packages/frontend/src/lib/condor/encoder.ts

// Helper: load the wasm-bindgen JS glue from /pkg (or VITE override)
export async function loadCondorDecoder() {
  const base = (import.meta.env as any)?.VITE_CONDOR_WALLET_URL || "/pkg";
  const cleanBase = String(base).replace(/\/+$/, "");
  const jsUrl = `${cleanBase}/condor_wallet.js`;
  const wasmUrl = `${cleanBase}/condor_wallet_bg.wasm`;

  // dynamic import; @vite-ignore prevents Vite from trying to statically resolve the string
  const mod = await import(/* @vite-ignore */ jsUrl);

  // call the common init patterns if available
  const wasmPath = new URL(wasmUrl, import.meta.url).href;
  if (mod && typeof mod.default === "function") {
    await mod.default({ module_or_path: wasmPath }).catch(async () => {
      if (typeof mod.init === "function") await mod.init({ module_or_path: wasmPath });
      else if (typeof mod.initWallet === "function") await mod.initWallet({ module_or_path: wasmPath });
    });
  } else if (mod && typeof mod.init === "function") {
    await mod.init({ module_or_path: wasmPath });
  }

  return mod;
}

/* --- your robust helpers (keep as you wrote them) --- */
async function toBase64(u8: Uint8Array): Promise<string> {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < u8.length; i += CHUNK) {
    // safe chunked conversion
    binary += String.fromCharCode.apply(null, Array.prototype.slice.call(u8.subarray(i, i + CHUNK)));
  }
  if (typeof btoa !== "undefined") return btoa(binary);
  if (typeof Buffer !== "undefined") return Buffer.from(binary, "binary").toString("base64");
  throw new Error("ERR_INTERNAL: no base64 encoder available");
}

function normalizeReturn(raw: any): { address?: string; keyHex?: string } | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (typeof raw === "object") {
    const key = raw.keyHex ?? raw.key ?? raw.privateKey ?? raw.private_key ?? raw.private_key_hex;
    const address = raw.address ?? raw.addr ?? raw.account;
    if (key || address) return { address, keyHex: key };
  }
  return null;
}
function isCharCodeAtError(e: any) {
  if (!e || !e.message) return false;
  return e.message.includes("charCodeAt") || (e.message.includes("is not a function") && e.message.includes("charCodeAt"));
}
async function callMaybeAsync(fn: Function, ...args: any[]) {
  const res = fn.apply(null, args);
  if (res && typeof (res as any).then === "function") return await res;
  return res;
}

/* --- main wrapper used by components --- */
export async function walletFromImageWithPassword(pngBytesInput: Uint8Array | ArrayBuffer | Blob | File, passphrase: string) {
  const api = await loadCondorDecoder();
  const fn = api?.wallet_from_image_with_password ?? api?.wallet_from_key ?? null;
  if (!fn) throw new Error("ERR_INTERNAL: decoder function not found");

  // normalize input to Uint8Array
  let pngU8: Uint8Array;
  if (pngBytesInput instanceof Uint8Array) pngU8 = pngBytesInput;
  else if (pngBytesInput instanceof ArrayBuffer) pngU8 = new Uint8Array(pngBytesInput);
  else if (typeof Blob !== "undefined" && pngBytesInput instanceof Blob) {
    const ab = await pngBytesInput.arrayBuffer();
    pngU8 = new Uint8Array(ab);
  } else if ((pngBytesInput as any)?.data && (pngBytesInput as any).data instanceof Uint8Array) {
    pngU8 = (pngBytesInput as any).data as Uint8Array;
  } else {
    pngU8 = new Uint8Array(pngBytesInput as any);
  }

  const attempts: Array<() => Promise<any>> = [];
  attempts.push(async () => callMaybeAsync(fn, pngU8, passphrase));
  attempts.push(async () => { const b64 = await toBase64(pngU8); return callMaybeAsync(fn, b64, passphrase); });
  attempts.push(async () => callMaybeAsync(fn, passphrase, pngU8));
  attempts.push(async () => { const b64 = await toBase64(pngU8); return callMaybeAsync(fn, passphrase, b64); });

  const errors: any[] = [];
  for (const att of attempts) {
    try {
      const raw = await att();
      const parsed = normalizeReturn(raw);
      if (parsed && (parsed.keyHex || parsed.address)) return parsed;
      errors.push({ raw, parsed });
    } catch (e) {
      errors.push(e);
      if (isCharCodeAtError(e)) continue;
    }
  }

  const hadObjectNoKey = errors.some(x => x && x.parsed === null && typeof x.raw === "object");
  if (hadObjectNoKey) throw new Error("ERR_CORRUPT_IMAGE: Decode returned object without a private key");
  if (errors.some(isCharCodeAtError)) throw new Error("ERR_BAD_FORMAT_OR_TYPES: Decoder rejected argument types");
  const debug = errors.slice(0,5).map(e => (e && e.message) || JSON.stringify(e)).join(" | ");
  throw new Error(`ERR_INTERNAL: decode failed (${debug})`);
}

/* --- compatibility / consumer-facing exports --- */

// components expect a function decodePngToPrivateKey(fileOrBuf, pass)
export async function decodePngToPrivateKey(
  png: File | Blob | ArrayBuffer | Uint8Array,
  pass: string
): Promise<string | { address?: string; keyHex?: string }> {
  // normalize input to Uint8Array
  let u8: Uint8Array;
  if (png instanceof Uint8Array) {
    u8 = png;
  } else if (png instanceof ArrayBuffer) {
    u8 = new Uint8Array(png);
  } else if (typeof Blob !== "undefined" && png instanceof Blob) {
    const ab = await png.arrayBuffer();
    u8 = new Uint8Array(ab);
  } else if ((png as any)?.data && (png as any).data instanceof Uint8Array) {
    // some libs return an object with .data = Uint8Array
    u8 = (png as any).data as Uint8Array;
  } else {
    // last resort - try to coerce (may throw if not convertible)
    u8 = new Uint8Array(png as any);
  }

  // create a safe copy so the underlying buffer is a true ArrayBuffer (avoid SharedArrayBuffer issues)
  const seg = u8.subarray(u8.byteOffset, u8.byteOffset + u8.byteLength);
  const copy = seg.slice(); // new Uint8Array backed by a plain ArrayBuffer

  // call the robust wrapper that tries the various calling conventions
  // walletFromImageWithPassword is the function that will load the wasm and attempt decode
  const result = await walletFromImageWithPassword(copy, pass);

  // normalize return:
  // - if wrapper returned a string, assume it's the private key
  if (typeof result === "string") return result;

  // - if wrapper returned an object, try to extract the private key field
  if (result && typeof result === "object") {
    if (result.keyHex) return result.keyHex;
    if (result.key) return result.key;
    if (result.privateKey) return result.privateKey;
    // if it has address but no private key, return the object so caller can react (or treat as corrupt)
    if (result.address) return result;
  }

  // fallback: throw an explicit error so callers can map it to UI
  throw new Error("ERR_CORRUPT_IMAGE: decode did not return a private key or valid wallet object");
}

// export default helpers you use elsewhere (if you have privateKeyToWallet implemented somewhere else,
// keep a single implementation. If needed, re-export it here or in condor.ts)
export { walletFromImageWithPassword as wallet_from_image_with_password };


// --- Added by feat/decoder-accept-uint8array: decodePngToPrivateKey accepts Uint8Array ---

export async function decodePngToPrivateKey(png: File | Blob | ArrayBuffer | Uint8Array, pass: string): Promise<string | { address?: string; keyHex?: string }> {
  // normalize input to Uint8Array
  let u8: Uint8Array;
  if (png instanceof Uint8Array) { u8 = png; }
  else if (png instanceof ArrayBuffer) { u8 = new Uint8Array(png); }
  else if (typeof Blob !== 'undefined' && png instanceof Blob) { const ab = await png.arrayBuffer(); u8 = new Uint8Array(ab); }
  else if ((png as any)?.data && (png as any).data instanceof Uint8Array) { u8 = (png as any).data as Uint8Array; }
  else { u8 = new Uint8Array(png as any); }

  // safe copy
  const seg = u8.subarray(u8.byteOffset, u8.byteOffset + u8.byteLength);
  const copy = seg.slice();

  const result = await walletFromImageWithPassword(copy, pass);

  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    if (result.keyHex) return result.keyHex;
    if (result.key) return result.key;
    if (result.privateKey) return result.privateKey;
    if (result.address) return result;
  }

  throw new Error('ERR_CORRUPT_IMAGE: decode did not return a private key or valid wallet object');
}
