const express = require("express");
const fetch = require("node-fetch");

const router = express.Router();

const BASE = "https://bsc.api.0x.org/swap/v1";

function auth() {
  const h = { accept: "application/json" };
  if (process.env.ZEROX_API_KEY) h["0x-api-key"] = process.env.ZEROX_API_KEY;
  return h;
}

router.get("/price", async (req, res) => {
  try {
    const url = `${BASE}/price?${new URLSearchParams(req.query)}`;
    const r = await fetch(url, { headers: auth() });
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const text = await r.text();
      return res
        .status(r.status)
        .json({ ok: false, error: "non-json", status: r.status, body: text.slice(0, 400) });
    }
    const j = await r.json();
    return res.status(r.status).json(j);
  } catch (e) {
    console.error("0x/price error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/quote", async (req, res) => {
  try {
    const url = `${BASE}/quote?${new URLSearchParams(req.query)}`;
    const r = await fetch(url, { headers: auth() });
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const text = await r.text();
      return res
        .status(r.status)
        .json({ ok: false, error: "non-json", status: r.status, body: text.slice(0, 400) });
    }
    const j = await r.json();
    return res.status(r.status).json(j);
  } catch (e) {
    console.error("0x/quote error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;

