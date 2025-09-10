const router = require("express").Router();
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

// simple in-memory cache
let cache = null;
let cacheTs = 0;
const TTL_MS = 60_000;

router.get("/", async (_req, res) => {
  try {
    const now = Date.now();
    if (cache && now - cacheTs < TTL_MS) return res.json(cache);

    const GCC = (process.env.TOKEN_GCC || "").toLowerCase();
    const WBNB = (process.env.TOKEN_WBNB || "").toLowerCase();

    // 1) WBNB → USD (Dexscreener reports many pairs; prefer stable-quoted)
    const wbnbTok = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${WBNB}`).then(r => r.json());
    const wbnbUsd = pickBestUsd(wbnbTok, WBNB);

    // 2) GCC → WBNB via Dexscreener token endpoint (GCC pairs)
    const gccTok = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${GCC}`).then(r => r.json());
    const gccToWbnb = pickBestNative(gccTok, GCC); // native = WBNB
    const gccUsd = gccToWbnb * wbnbUsd;

    cache = { bnbUsd: wbnbUsd, wbnbUsd, gccUsd };
    cacheTs = now;
    return res.json(cache);
  } catch (e) {
    if (cache) return res.json(cache);
    return res.status(502).json({ error: "price_fetch_failed" });
  }
});

function pickBestUsd(resp, baseAddr) {
  // Prefer quoteToken that is a USD stable (BUSD/USDT/USDC), fallback to first priceUsd provided
  const stables = new Set(["busd", "usdt", "usdc"]);
  const pairs = resp?.pairs || [];
  const stable = pairs.find(p =>
    p.baseToken?.address?.toLowerCase() === baseAddr &&
    p.priceUsd &&
    stables.has(p.quoteToken?.address?.toLowerCase?.() || p.quoteToken?.symbol?.toLowerCase?.())
  );
  const anyUsd = pairs.find(p => p.baseToken?.address?.toLowerCase() === baseAddr && p.priceUsd);
  return Number(stable?.priceUsd || anyUsd?.priceUsd || 0);
}

function pickBestNative(resp, baseAddr) {
  const pairs = resp?.pairs || [];
  // Prefer pairs whose quote is WBNB (native on BSC for Dexscreener priceNative)
  const withNative = pairs.find(p => p.baseToken?.address?.toLowerCase() === baseAddr && p.priceNative);
  return Number(withNative?.priceNative || 0);
}

module.exports = router;
