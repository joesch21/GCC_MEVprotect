const fetch = globalThis.fetch;

async function safeProxyJson(req, res, url, headers = {}) {
  try {
    const r = await fetch(url, { headers });
    const ct = r.headers.get('content-type') || '';
    let body;
    if (ct.includes('application/json')) {
      body = await r.json().catch(() => ({}));
    } else {
      const text = await r.text();
      body = { error: 'non-json-response', text };
    }
    if (!r.ok) return res.status(r.status).json({ ok: false, status: r.status, ...body });
    return res.json(body);
  } catch (e) {
    return res.status(502).json({ ok: false, status: 502, error: e.message });
  }
}

module.exports = { safeProxyJson };
