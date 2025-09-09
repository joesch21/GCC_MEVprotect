const express = require('express');
const { ethers } = require('ethers');
const { PANCAKE, APESWAP, WBNB } = require('../lib/routers.cjs');

const router = express.Router();

// very small ABI surface
const pairAbi = ["function getReserves() view returns (uint112,uint112,uint32)"];
const erc20Abi = ["function decimals() view returns (uint8)"];
const routerAbi = [
  "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)"
];

// Helpers
function isNative(addr){ return /^0xEeee/i.test(addr) || addr === 'BNB'; }
function toHex(v){ return ethers.toBeHex(v); }

router.get('/quote', async (req, res) => {
  try {
    const { chainId="56", sellToken, buyToken, sellAmount } = req.query;
    if (chainId !== "56") return res.status(400).json({ error: "Only BNB Chain (56) supported" });

    const rpc = process.env.PRIVATE_RPC_URL;
    const provider = new ethers.JsonRpcProvider(rpc, 56);

    const sellsNative = isNative(sellToken);
    const buysNative  = isNative(buyToken);
    const sellAddr = sellsNative ? WBNB : sellToken;
    const buyAddr  = buysNative ? WBNB : (buyToken === 'BNB' ? WBNB : buyToken);

    // candidate paths (simple; extend as needed)
    const candidates = [
      { routerPath: [sellAddr, buyAddr], displayPath: [sellsNative ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' : sellToken, buysNative ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' : buyToken] },
      { routerPath: [sellAddr, WBNB, buyAddr], displayPath: [sellsNative ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' : sellToken, WBNB, buysNative ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' : buyToken] }
    ].filter(c => c.routerPath.every(Boolean) && new Set(c.routerPath).size === c.routerPath.length);

    const routers = [
      { name: "Pancake", addr: PANCAKE.ROUTER },
      { name: "ApeSwap", addr: APESWAP.ROUTER }
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

    if (!best) return res.status(404).json({ error: "No route on Pancake/ApeSwap" });
    res.json(best);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
