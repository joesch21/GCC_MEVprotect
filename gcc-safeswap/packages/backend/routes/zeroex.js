const express = require('express');
const router = express.Router();

const ZEROEX_API_KEY = process.env.ZEROEX_API_KEY || '';

router.get('/price', async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const resp = await fetch(`https://api.0x.org/swap/v2/price?${qs}`, {
      headers: ZEROEX_API_KEY ? { '0x-api-key': ZEROEX_API_KEY } : {}
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/quote', async (req, res) => {
  try {
    console.log("0x/quote params:", Object.fromEntries(new URLSearchParams(req.url.split("?")[1]||"")));
    const qs = new URLSearchParams(req.query).toString();
    const resp = await fetch(`https://api.0x.org/swap/v2/quote?${qs}`, {
      headers: ZEROEX_API_KEY ? { '0x-api-key': ZEROEX_API_KEY } : {}
    });
    const data = await resp.json();
    const isNoRoute = resp.status === 404 || /no route/i.test(JSON.stringify(data));
    res.status(isNoRoute ? 404 : resp.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
