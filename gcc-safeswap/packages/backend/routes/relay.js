const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

router.use("/private", rateLimit({ windowMs: 60_000, max: 20 }));

router.post("/private", async (req, res) => {
  const rawTx = req.body?.rawTx;
  if (!rawTx || !/^0x[0-9a-fA-F]+$/.test(rawTx)) {
    return res.status(400).json({ ok: false, error: "invalid_raw_tx" });
  }

  const RELAY_URL = process.env.RELAY_URL || "https://api.blxrbdn.com/eth/v1/tx";
  const auth = process.env.BLXR_AUTH;
  if (!auth) return res.status(503).json({ ok: false, error: "relay_unavailable" });

  try {
    const r = await fetch(RELAY_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify({ tx: rawTx })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ ok: false, error: "relay_failed", details: j });
    const txHash = j.txHash || j.result?.txHash || j.hash || null;
    return res.json({ ok: true, txHash, relay: j });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "relay_failed", details: String(e) });
  }
});

module.exports = router;
