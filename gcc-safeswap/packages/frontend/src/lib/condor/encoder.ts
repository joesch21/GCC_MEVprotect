// packages/frontend/src/lib/condor/encoder.ts

type EncModule = {
  // init (varies by template)
  default?: (wasm?: string | { module_or_path: string }) => Promise<any> | any;

  // possible decode exports (different builds use different names)
  decode_png?: (png: Uint8Array, pass: string) => Promise<any> | any;
  wallet_from_image_with_password?: (png: Uint8Array, pass: string) => Promise<any> | any;
  decode_wallet_from_image?: (png: Uint8Array, pass: string) => Promise<any> | any;
};

let ready: Promise<EncModule> | null = null;

function resolvedUrls() {
  // Prefer same-origin; allow Vite env overrides
  const js =
    (import.meta as any)?.env?.VITE_CONDOR_WALLET_JS_URL ??
    "/pkg/condor_encoder.js";
  const wasm =
    (import.meta as any)?.env?.VITE_CONDOR_WALLET_WASM_URL ??
    "/pkg/condor_encoder_bg.wasm";

  // guard against accidental legacy names in envs
  const fixJs = js.replace(/condor_wallet\.js$/i, "condor_encoder.js");
  const fixWasm = wasm.replace(/condor_wallet_bg\.wasm$/i, "condor_encoder_bg.wasm");

  return { js: fixJs, wasm: fixWasm };
}

export async function loadEncoder(): Promise<EncModule> {
  if (ready) return ready;
  ready = (async () => {
    const { js, wasm } = resolvedUrls();
    console.info("[Condor] loading wasm module", { jsUrl: js, wasmUrl: wasm });

    // dynamic import; avoid Vite pre
