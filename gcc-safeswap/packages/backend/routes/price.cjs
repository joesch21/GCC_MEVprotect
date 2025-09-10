const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const router = express.Router();
const log = console;

// --- tiny in-memory cache ---
let cache = { data: null, ts: 0 };
const TTL_MS = 25_000; // ~25s

async function fetchDexscreener(url) {
  const r = await fetch(url, { timeout: 8000 });
  if (!r.ok) throw new Error(`dexscreener ${r.status}`);
  const j = await r.json();
  const usd = Number(j?.priceUsd ?? j?.pairs?.[0]?.priceUsd);
  const bnb = Number(j?.priceNative ?? j?.pairs?.[0]?.priceNative);
  if (!usd) throw new Error('dexscreener no usd');
  return { usd, bnb: bnb || null, source: 'dexscreener' };
}

async function fetchCoinGecko(url) {
  const r = await fetch(url, { timeout: 8000 });
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const j = await r.json();
  const first = j && Object.values(j)[0];
  const usd = Number(first?.usd);
  if (!usd) throw new Error('coingecko no usd');
  return { usd, bnb: null, source: 'coingecko' };
}

async function getFreshPrice() {
  try {
    const url = process.env.DEXSCREENER_TOKEN_URL;
    if (url) return await fetchDexscreener(url);
  } catch (e) {
    log.warn('[price] dexscreener fail', e.message);
  }
  try {
    const url = process.env.COINGECKO_SIMPLE_URL;
    if (url) return await fetchCoinGecko(url);
  } catch (e) {
    log.warn('[price] coingecko fail', e.message);
  }
  throw new Error('all price sources failed');
}

router.get('/price/gcc', async (req, res) => {
  try {
    const now = Date.now();
    const force = req.query.refresh === '1';

    if (!force && cache.data && now - cache.ts < TTL_MS) {
      return res.json({ ...cache.data, ts: cache.ts, cached: true, ttl: TTL_MS - (now - cache.ts) });
    }

    const fresh = await getFreshPrice();
    cache = { data: fresh, ts: now };
    log.info('PRICE SRC', fresh.source);
    res.json({ ...fresh, ts: now, cached: false, ttl: TTL_MS });
  } catch (e) {
    if (cache.data) {
      return res.json({ ...cache.data, ts: cache.ts, cached: true, stale: true, ttl: 0, note: e.message });
    }
    res.status(502).json({ error: e.message || String(e) });
  }
});

module.exports = router;
