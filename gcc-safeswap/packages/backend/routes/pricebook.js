const router = require("express").Router();
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

let cache = null;
let ts = 0;
const TTL = 60_000;

router.get("/", async (_req, res) => {
  try {
    if (cache && Date.now() - ts < TTL) return res.json(cache);

    const GCC = (process.env.TOKEN_GCC || "").toLowerCase();
    const WBNB = (process.env.TOKEN_WBNB || "").toLowerCase();
    const pair = (process.env.PAIR_GCC_WBNB || "").toLowerCase();
    if (!pair) return res.status(500).json({ error: "missing_pair" });

    const byPair = await fetch(`https://api.dexscreener.com/latest/dex/pairs/bsc/${pair}`).then(r => r.json());
    const p = byPair?.pair;
    if (
      p?.baseToken?.address?.toLowerCase() !== GCC ||
      p?.quoteToken?.address?.toLowerCase() !== WBNB ||
      !p?.priceNative
    ) {
      return res.status(502).json({ error: "pair_unpriced" });
    }

    const gccPerWbnb = Number(p.priceNative);

    // WBNB → USD: prefer stable-quoted pairs
    const wTok = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${WBNB}`).then(r => r.json());
    const stables = new Set(["usdt", "usdc", "busd"]);
    const stablePair = (wTok?.pairs || []).find(p =>
      p.baseToken?.address?.toLowerCase() === WBNB &&
      p.priceUsd &&
      stables.has(p?.quoteToken?.symbol?.toLowerCase?.())
    ) || (wTok?.pairs || []).find(p => p.priceUsd);
    const wbnbUsd = Number(stablePair?.priceUsd || 0);

    cache = { gccPerWbnb, wbnbUsd };
    ts = Date.now();
    res.json(cache);
  } catch (e) {
    res.status(502).json({ error: "price_fetch_failed" });
  }
});

module.exports = router;

