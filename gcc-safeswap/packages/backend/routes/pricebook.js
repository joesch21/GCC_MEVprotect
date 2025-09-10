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
    const PAIR = (process.env.PAIR_GCC_WBNB || "").toLowerCase();

    // (A) GCC per WBNB from a pinned pair
    let gccPerWbnb = 0;
    if (PAIR) {
      const byPair = await fetch(`https://api.dexscreener.com/latest/dex/pairs/bsc/${PAIR}`).then(r => r.json());
      const p = byPair?.pair;
      if (
        p?.baseToken?.address?.toLowerCase() === GCC &&
        p?.quoteToken?.address?.toLowerCase() === WBNB &&
        p?.priceNative
      ) {
        gccPerWbnb = Number(p.priceNative);
      }
    }
    // (B) Fallback: token search (if PAIR not set or invalid)
    if (!gccPerWbnb) {
      const tok = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${GCC}`).then(r => r.json());
      const p = (tok?.pairs || []).find(x =>
        x.baseToken?.address?.toLowerCase() === GCC &&
        x.quoteToken?.address?.toLowerCase() === WBNB &&
        x.priceNative
      );
      gccPerWbnb = Number(p?.priceNative || 0);
    }

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

