const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const router = express.Router();

// --- tiny in-memory cache ---
let cache = { data: null, ts: 0 };
const TTL_MS = 60_000; // 60s

async function fetchDexscreener(pair) {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/pairs/bsc/${pair}`, { timeout: 8000 });
  if (!r.ok) throw new Error(`dexscreener ${r.status}`);
  const j = await r.json();
  const p = j?.pairs?.[0];
  if (!p) throw new Error('dexscreener no pair');
  return {
    usd: p.priceUsd ? Number(p.priceUsd) : null,
    bnb: p.priceNative ? Number(p.priceNative) : null,
    src: 'dexscreener'
  };
}

// Optional secondary (commented; enable if you add CG id later)
// async function fetchCoinGecko(id) { ... }

async function getFreshPrice() {
  const pair = process.env.DEXSCREENER_PAIR;
  if (!pair) throw new Error('DEXSCREENER_PAIR missing');
  // Primary
  try {
    return await fetchDexscreener(pair);
  } catch (e) {
    // console.warn('[price] dex fail', e);
  }
  // Secondary fallback example:
  // try { return await fetchCoinGecko(process.env.COINGECKO_ID); } catch {}
  throw new Error('all price sources failed');
}

router.get('/price/gcc', async (req, res) => {
  try {
    const now = Date.now();

    // manual bypass: /api/price/gcc?refresh=1
    const force = req.query.refresh === '1';

    if (!force && cache.data && now - cache.ts < TTL_MS) {
      return res.json({ ...cache.data, ts: cache.ts, cached: true, ttl: TTL_MS - (now - cache.ts) });
    }

    const fresh = await getFreshPrice();
    cache = { data: fresh, ts: now };
    res.json({ ...fresh, ts: now, cached: false, ttl: TTL_MS });
  } catch (e) {
    // If fresh fetch fails, but we have warm cache, serve it with stale flag
    if (cache.data) {
      return res.json({ ...cache.data, ts: cache.ts, cached: true, stale: true, ttl: 0, note: e.message });
    }
    res.status(502).json({ error: e.message || String(e) });
  }
});

module.exports = router;
