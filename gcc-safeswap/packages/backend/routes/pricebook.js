const router = require('express').Router();
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const PAIR_ID = process.env.DEXSCREENER_GCC_WBNB;
const TTL = Number(process.env.PRICEBOOK_TTL_SEC || 60) * 1000;
const TIMEOUT = Number(process.env.PRICEBOOK_UPSTREAM_TIMEOUT_MS || 4000);

let cache = null; // { at: number, data: PriceBook }

async function getJson(url, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { 'user-agent': 'gcc-safeswap/pricebook' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchDexScreener() {
  const url = `https://api.dexscreener.com/latest/dex/pairs/${PAIR_ID}`;
  const json = await getJson(url, TIMEOUT);
  const pair = json?.pairs?.[0];
  if (!pair) throw new Error('No pair');

  const priceUsdBNB = Number(
    pair?.baseToken?.symbol === 'WBNB' ? pair?.priceUsd : pair?.priceUsdBase
  );
  const priceUsdGCC = Number(
    pair?.baseToken?.symbol === 'WBNB' ? pair?.priceUsdQuote : pair?.priceUsd
  );
  if (!isFinite(priceUsdBNB) || !isFinite(priceUsdGCC)) throw new Error('Bad numbers');
  const gccBnb = priceUsdGCC / priceUsdBNB;
  return {
    updatedAt: new Date().toISOString(),
    stale: false,
    sources: ['dexscreener'],
    prices: {
      bnbUsd: priceUsdBNB,
      gccBnb,
      gccUsd: priceUsdGCC,
    },
  };
}

router.get('/', async (_req, res) => {
  const now = Date.now();
  if (cache && now - cache.at < TTL) {
    console.log(JSON.stringify({ pricebook: 'cache' }));
    return res.json(cache.data);
  }
  try {
    const data = await fetchDexScreener();
    cache = { at: now, data };
    console.log(JSON.stringify({ pricebook: 'fresh', sources: data.sources }));
    return res.json(data);
  } catch (e) {
    if (cache) {
      console.warn(JSON.stringify({ pricebook: 'stale', error: String(e) }));
      return res.json({ ...cache.data, stale: true });
    }
    console.error(JSON.stringify({ pricebook: 'empty', error: String(e) }));
    return res.json({
      updatedAt: new Date().toISOString(),
      stale: true,
      sources: [],
      prices: { bnbUsd: 0, gccBnb: 0, gccUsd: 0 },
    });
  }
});

module.exports = router;
