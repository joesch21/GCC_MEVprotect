const express = require('express');
const { ethers } = require('ethers');
const { PANCAKE, APESWAP } = require('../lib/routers.cjs');

const router = express.Router();

const CHAIN_BSC = 56;
const WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
const NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function normalizeToken(addrOrSymbol, chainId) {
  if (!addrOrSymbol) return addrOrSymbol;
  const s = String(addrOrSymbol).toLowerCase();
  const isNative = s === 'bnb' || s === NATIVE_SENTINEL;
  if (Number(chainId) === CHAIN_BSC && isNative) return WBNB;
  return addrOrSymbol;
}

function isNative(addrOrSymbol) {
  if (!addrOrSymbol) return false;
  const s = String(addrOrSymbol).toLowerCase();
  return s === 'bnb' || s === NATIVE_SENTINEL;
}

// very small ABI surface
const pairAbi = ["function getReserves() view returns (uint112,uint112,uint32)"];
const erc20Abi = ["function decimals() view returns (uint8)"];
const routerAbi = [
  "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)"
];

// Helpers
function toHex(v){ return ethers.toBeHex(v); }

router.get('/quote', async (req, res) => {
  try {
    const chainId = Number(req.query.chainId || CHAIN_BSC);
    if (chainId !== CHAIN_BSC) return res.status(400).json({ error: 'Only BNB Chain (56) supported' });

    const rpc = process.env.PRIVATE_RPC_URL;
    const provider = new ethers.JsonRpcProvider(rpc, 56);

    const sellTokenRaw = req.query.sellToken;
    const buyTokenRaw  = req.query.buyToken;
    const sellAmount   = req.query.sellAmount;

    const sellsNative = isNative(sellTokenRaw);
    const buysNative  = isNative(buyTokenRaw);
    const sellAddr    = normalizeToken(sellTokenRaw, chainId);
    const buyAddr     = normalizeToken(buyTokenRaw,  chainId);

    console.log('dex/quote params:', { chainId, sellToken: sellAddr, buyToken: buyAddr, sellAmount });

    // candidate paths (simple; extend as needed)
    const candidates = [
      { routerPath: [sellAddr, buyAddr], displayPath: [sellsNative ? NATIVE_SENTINEL : sellTokenRaw, buysNative ? NATIVE_SENTINEL : buyTokenRaw] },
      { routerPath: [sellAddr, WBNB, buyAddr], displayPath: [sellsNative ? NATIVE_SENTINEL : sellTokenRaw, WBNB, buysNative ? NATIVE_SENTINEL : buyTokenRaw] }
    ].filter(c => c.routerPath.every(Boolean) && new Set(c.routerPath).size === c.routerPath.length);

    const routers = [
      { name: 'Pancake', addr: PANCAKE.ROUTER },
      { name: 'ApeSwap', addr: APESWAP.ROUTER }
    ];

    let best = null;

    for (const r of routers) {
      const routerC = new ethers.Contract(r.addr, routerAbi, provider);
      for (const c of candidates) {
        try {
          const amounts = await routerC.getAmountsOut(sellAmount, c.routerPath);
          const buyAmount = amounts[amounts.length - 1].toString();
          if (!best || BigInt(buyAmount) > BigInt(best.buyAmount)) {
            best = { chainId: 56, router: r.addr, routerName: r.name, path: c.displayPath, sellAmount, buyAmount, amounts: amounts.map(x=>x.toString()) };
          }
        } catch (_) { /* illiquid or no route: ignore */ }
      }
    }

    if (!best) return res.status(404).json({ error: 'No route on Pancake/ApeSwap' });
    res.json(best);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

