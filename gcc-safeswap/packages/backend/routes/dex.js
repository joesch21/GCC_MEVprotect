const express = require('express');
const fetch = globalThis.fetch;
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
    if (chainId !== CHAIN_BSC) return res.status(400).json({ ok: false, status: 400, error: 'Only BNB Chain (56) supported' });

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

    if (!best) return res.status(404).json({ ok: false, status: 404, error: 'No route on Pancake/ApeSwap' });
    res.json(best);
  } catch (e) {
    res.status(500).json({ ok: false, status: 500, error: e.message });
  }
});

async function buildRouterTxFromQuote(q, taker, slippageBps=200){
  const iface = new ethers.Interface([
    "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)",
    "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] path, address to, uint deadline) payable",
    "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)"
  ]);
  const deadline = Math.floor(Date.now()/1000) + 60*10;
  const minOut = BigInt(q.buyAmount) * BigInt(10_000 - Number(slippageBps)) / 10_000n;
  const sellsNative = /^0xEeee/i.test(q.path[0]) || q.path[0] === 'BNB';
  const buysNative  = /^0xEeee/i.test(q.path[q.path.length-1]) || q.path[q.path.length-1] === 'BNB';
  const finalPath = q.path.map(a => /^0xEeee/i.test(a) || a === 'BNB' ? WBNB : a);
  let data, value = '0x0';
  if (sellsNative) {
    data = iface.encodeFunctionData(
      'swapExactETHForTokensSupportingFeeOnTransferTokens',
      [minOut.toString(), finalPath, taker, deadline]
    );
    value = toHex(q.sellAmount);
  } else if (buysNative) {
    data = iface.encodeFunctionData(
      'swapExactTokensForETHSupportingFeeOnTransferTokens',
      [q.sellAmount, minOut.toString(), finalPath, taker, deadline]
    );
  } else {
    data = iface.encodeFunctionData(
      'swapExactTokensForTokensSupportingFeeOnTransferTokens',
      [q.sellAmount, minOut.toString(), finalPath, taker, deadline]
    );
  }
  return { to: q.router, data, value };
}

router.get('/buildTx', async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query);
    const port = process.env.PORT || 8787;
    const r0x = await fetch(`http://localhost:${port}/api/0x/quote?${qs}`);
    let j0x, ok0x = false;
    try {
      j0x = await r0x.json();
      ok0x = r0x.ok && j0x?.to && j0x?.data;
    } catch {}
    if (ok0x) {
      const tx = {
        to: j0x.to,
        data: j0x.data,
        ...(j0x.value ? { value: j0x.value } : {}),
        ...(j0x.gas ? { gas: toHex(j0x.gas) } : {})
      };
      return res.json({ source: '0x', tx, quote: j0x });
    }

    const rDex = await fetch(`http://localhost:${port}/api/dex/quote?${qs}`);
    const jDex = await rDex.json();
    if (!rDex.ok) return res.status(502).json({ ok: false, error: 'amm-quote-failed', detail: jDex });
    const tx = await buildRouterTxFromQuote(jDex, req.query.taker, req.query.slippageBps);
    return res.json({ source: 'dex', tx, quote: jDex });
  } catch (e) {
    console.error('buildTx error', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;

