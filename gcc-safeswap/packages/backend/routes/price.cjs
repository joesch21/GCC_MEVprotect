const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const router = express.Router();

const GCC = process.env.GCC_ADDRESS.toLowerCase();
const TTL_MS = 30_000;
let cache = { t: 0, priceUsd: null, source: null };

async function getFromDexscreener() {
  const url = `${process.env.DEXSCREENER_TOKEN_URL}/${GCC}`;
  const r = await fetch(url, { timeout: 10_000 });
  if (!r.ok) throw new Error('dexscreener http ' + r.status);
  const json = await r.json();
  const pairs = json?.pairs || [];
  if (!pairs.length) throw new Error('dexscreener no pairs');
  pairs.sort((a,b)=>(+b.liquidity?.usd||0) - (+a.liquidity?.usd||0));
  const price = parseFloat(pairs[0]?.priceUsd || 0);
  if (!price) throw new Error('dexscreener no price');
  return { priceUsd: price, source: 'dexscreener' };
}

async function getFromCoinGecko() {
  const url = `${process.env.COINGECKO_SIMPLE_URL}?contract_addresses=${GCC}&vs_currencies=usd`;
  const r = await fetch(url, { timeout: 10_000 });
  if (!r.ok) throw new Error('coingecko http ' + r.status);
  const json = await r.json();
  const lower = GCC.toLowerCase();
  const price = json?.[lower]?.usd;
  if (!price) throw new Error('coingecko no price');
  return { priceUsd: price, source: 'coingecko' };
}

async function resolvePrice() {
  const now = Date.now();
  if (cache.priceUsd && (now - cache.t) < TTL_MS) return cache;
  let data;
  try { data = await getFromDexscreener(); }
  catch {
    try { data = await getFromCoinGecko(); }
    catch (e2) { data = null; }
  }
  if (!data) throw new Error('price unavailable');
  cache = { ...data, t: now };
  return cache;
}

router.get('/price/gcc', async (req, res) => {
  try {
    const out = await resolvePrice();
    res.json({ priceUsd: out.priceUsd, source: out.source, cachedAt: cache.t });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

module.exports = router;
