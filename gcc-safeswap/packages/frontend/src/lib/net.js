export async function fetchJSON(url, { timeoutMs = 7000, ...opts } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const ct = res.headers.get('content-type') || '';
    let json;
    if (ct.includes('application/json')) {
      json = await res.json().catch(() => ({}));
    } else {
      const text = await res.text();
      json = { error: 'non-json-response', text };
    }
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}
