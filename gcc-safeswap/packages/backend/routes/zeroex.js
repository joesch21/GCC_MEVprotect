const express = require("express");
const { safeProxyJson } = require("./util.js");

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
router.get("/price", (req, res) => {
  const q = { ...req.query };
  q.chainId = q.chainId || CHAIN_BSC;

  // normalize native BNB ➜ WBNB
  q.sellToken = normalizeToken(q.sellToken, q.chainId);
  q.buyToken  = normalizeToken(q.buyToken,  q.chainId);

  const url = buildUrl(`${BASE}/swap/v2/price`, q);
  return safeProxyJson(req, res, url, authHeaders());
});

// ----- Firm quote w/ calldata -----
router.get("/quote", (req, res) => {
  const q = { ...req.query };
  q.chainId = q.chainId || CHAIN_BSC;

  // normalize native BNB ➜ WBNB
  q.sellToken = normalizeToken(q.sellToken, q.chainId);
  q.buyToken  = normalizeToken(q.buyToken,  q.chainId);

  console.log("0x/quote params:", q);

  const url = buildUrl(`${BASE}/swap/v2/quote`, q);
  return safeProxyJson(req, res, url, authHeaders());
});

module.exports = router;

