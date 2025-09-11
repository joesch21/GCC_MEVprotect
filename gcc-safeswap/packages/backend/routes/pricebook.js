const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

/** @typedef {{ updatedAt: string; stale: boolean; sources: string[]; prices: { bnbUsd: number; gccUsd: number; gccBnb: number } }} PriceBook */

const router = express.Router();
const PAIR_ID = process.env.DEXSCREENER_GCC_WBNB;
const TTL = Number(process.env.PRICEBOOK_TTL_SEC || 60) * 1000;
const TIMEOUT = Number(process.env.PRICEBOOK_TIMEOUT_MS || 4000);

let cache = null; // { at:number, data:PriceBook }

async function fetchJSON(url, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { "user-agent": "gcc-safeswap/pricebook" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function loadDexscreener() {
  const api = `https://api.dexscreener.com/latest/dex/pairs/${PAIR_ID}`;
  const json = await fetchJSON(api, TIMEOUT);
  const pair = json?.pairs?.[0];
  if (!pair) throw new Error("no pair");

  const bnbUsd = Number(
    pair.baseToken?.symbol === "WBNB" ? pair.priceUsd : pair.priceUsdBase
  );
  const gccUsd = Number(
    pair.baseToken?.symbol === "WBNB" ? pair.priceUsdQuote : pair.priceUsd
  );
  if (!isFinite(bnbUsd) || !isFinite(gccUsd)) throw new Error("bad numbers");

  return {
    updatedAt: new Date().toISOString(),
    stale: false,
    sources: ["dexscreener"],
    prices: { bnbUsd, gccUsd, gccBnb: gccUsd / bnbUsd },
  };
}

router.get("/api/pricebook", async (_req, res) => {
  const now = Date.now();
  if (cache && now - cache.at < TTL) return res.json(cache.data);

  try {
    const fresh = await loadDexscreener();
    cache = { at: now, data: fresh };
    return res.json(fresh);
  } catch (_e) {
    if (cache) return res.json({ ...cache.data, stale: true });
    return res.json({
      updatedAt: new Date().toISOString(),
      stale: true,
      sources: [],
      prices: { bnbUsd: 0, gccUsd: 0, gccBnb: 0 },
    });
  }
});

module.exports = router;
