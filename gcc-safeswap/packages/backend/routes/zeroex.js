const express = require("express");
const fetch = require("node-fetch");

const router = express.Router();
const BASE = "https://api.0x.org";

// BNB Chain constants
const CHAIN_BSC = 56;
const WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
const NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function authHeaders() {
  const h = { accept: "application/json" };
  if (process.env.ZEROEX_API_KEY) h["0x-api-key"] = process.env.ZEROEX_API_KEY;
  return h;
}

function normalizeToken(addrOrSymbol, chainId) {
  if (!addrOrSymbol) return addrOrSymbol;
  const s = String(addrOrSymbol).toLowerCase();
  const isNative = s === "bnb" || s === NATIVE_SENTINEL;
  if (Number(chainId) === CHAIN_BSC && isNative) return WBNB;
  return addrOrSymbol;
}

function buildUrl(base, queryObj) {
  const url = new URL(base);
  Object.entries(queryObj).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  return url;
}

// ----- Indicative price -----
router.get("/price", async (req, res) => {
  try {
    const q = { ...req.query };
    q.chainId = q.chainId || CHAIN_BSC;

    // normalize native BNB ➜ WBNB
    q.sellToken = normalizeToken(q.sellToken, q.chainId);
    q.buyToken  = normalizeToken(q.buyToken,  q.chainId);

    const url = buildUrl(`${BASE}/swap/v2/price`, q);
    const r = await fetch(url, { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json(j);
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----- Firm quote w/ calldata -----
router.get("/quote", async (req, res) => {
  try {
    const q = { ...req.query };
    q.chainId = q.chainId || CHAIN_BSC;

    // normalize native BNB ➜ WBNB
    q.sellToken = normalizeToken(q.sellToken, q.chainId);
    q.buyToken  = normalizeToken(q.buyToken,  q.chainId);

    console.log("0x/quote params:", q);

    const url = buildUrl(`${BASE}/swap/v2/quote`, q);
    const r = await fetch(url, { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json(j);
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

