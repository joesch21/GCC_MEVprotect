let wasm: any;

export async function loadEncoder(base = "https://condor-encoder.onrender.com") {
  if (wasm) return wasm;
  const m = await import(/* @vite-ignore */ `${base}/pkg/condor_wallet.js`);
  await (m.default || (m as any).init || m)();
  wasm = m;
  return wasm;
}

export async function decodeFromPng(pngBytes: Uint8Array, pass: string) {
  const m = await loadEncoder();
  // expected return shape: { address, key }
  return await (m as any).decode_wallet_from_image(pngBytes, pass);
}
