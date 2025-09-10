const express = require('express');
const { ethers } = require('ethers');
const { normalizeToken, quoteViaRouter } = require('../lib/routers');

const router = express.Router();
const log = console;

const CHAIN_ID = 56;
const GCC = process.env.GCC_ADDRESS;
const WBNB = process.env.WBNB_ADDRESS;
const PANCAKE_ROUTER = process.env.PANCAKE_ROUTER;
const APESWAP_ROUTER = process.env.APESWAP_ROUTER;

const RPC_URL = process.env.RPC_URL_PRIVATE || process.env.RPC_URL_PUBLIC;
const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);

router.get('/quote', async (req, res) => {
  try {
    const { chainId, sellToken, buyToken, sellAmount } = req.query;
    if (String(chainId) !== String(CHAIN_ID)) {
      return res.status(400).json({ error: 'Unsupported chainId' });
    }
    if (!sellToken || !buyToken || !sellAmount) {
      return res.status(400).json({ error: 'Missing params' });
    }

    const sell = normalizeToken(sellToken, { WBNB });
    const buy = normalizeToken(buyToken, { WBNB });
    const path = [sell, buy];

    const tryRouters = [PANCAKE_ROUTER, APESWAP_ROUTER].filter(Boolean);

    let lastErr;
    for (const r of tryRouters) {
      try {
        const q = await quoteViaRouter({ routerAddr: r, provider, amountIn: sellAmount, path });
        log.info('DEX QUOTE', { router: r, path, amounts: q.amounts.map(a=>a.toString()) });
        return res.json({ chainId: CHAIN_ID, dex: r, ...q });
      } catch (err) {
        log.error('DEX QUOTE ERR', { router: r, msg: err.message });
        lastErr = err;
      }
    }

    return res
      .status(404)
      .json({ error: 'No route on configured DEXes', detail: String(lastErr?.reason || lastErr?.message || lastErr) });
  } catch (e) {
    return res.status(500).json({ error: 'DEX quote error', detail: String(e?.message || e) });
  }
});

module.exports = router;
