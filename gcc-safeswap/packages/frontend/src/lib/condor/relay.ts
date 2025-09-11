export async function sendViaPrivateRelay(rawTx: string, base = import.meta.env.VITE_RELAY_BASE as string) {
  if (!base) throw new Error("VITE_RELAY_BASE not set");
  const r = await fetch(`${base}/api/relay/private`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rawTx })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(`Relay failed: ${JSON.stringify(j)}`);
  return j;
}
