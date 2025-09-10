const router = require("express").Router();
const fetch = (...a)=>import("node-fetch").then(({default:f})=>f(...a));
const { ethers } = require("ethers");
const { getRouters, getTokens, provider } = require("../lib/routers");

const SLIPPAGE_DEFAULT_BPS = 200;

router.get("/quote", async (req, res) => {
  try {
    const chainId = Number(req.query.chainId || 56);
    const sellToken = (req.query.sellToken || "").toLowerCase();
    const buyToken  = (req.query.buyToken  || "").toLowerCase();
    const sellAmount = req.query.sellAmount;
    const taker = (req.query.taker || "").toLowerCase();
    const slippageBps = Number(req.query.slippageBps || SLIPPAGE_DEFAULT_BPS);

    console.log("DEX Quote Params:", { chainId, sellToken, buyToken, sellAmount, taker, slippageBps });

    // ----- Try 0x first -----
    const zkey = process.env.ZER0X_API_KEY || process.env.ZEROX_API_KEY || "";
    const oxUrl = `https://bsc.api.0x.org/swap/v1/quote?buyToken=${buyToken}&sellToken=${sellToken}&sellAmount=${sellAmount}&takerAddress=${taker}&slippagePercentage=${(slippageBps/10000).toFixed(4)}`;
    const oxRes = await fetch(oxUrl, { headers: zkey ? { "0x-api-key": zkey } : {} });
    if (oxRes.ok) {
      const data = await oxRes.json();
      return res.json({ source: "0x", buyAmount: data.buyAmount, data });
    }
    const text = await oxRes.text();
    console.warn("0x quote failed:", oxRes.status, text);

    // ----- Fallback to DEX routers -----
    const { PANCAKE, APESWAP } = getRouters();
    const { WBNB, GCC, USDT } = getTokens();
    // prefer path WBNB <-> GCC, then WBNB->USDT->GCC
    const pathDirect = [sellToken, buyToken];
    const pathViaUSDT = [sellToken, USDT, buyToken];

    const tryRouter = async (routerAddr, path) => {
      const iface = new ethers.Interface([
        "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)"
      ]);
      const calldata = iface.encodeFunctionData("getAmountsOut", [sellAmount, path]);
      const call = { to: routerAddr, data: calldata };
      const result = await provider.call(call);
      const [amounts] = iface.decodeFunctionResult("getAmountsOut", result);
      const buyAmt = amounts[amounts.length-1].toString();
      return { router: routerAddr, path, buyAmount: buyAmt };
    };

    const routers = [PANCAKE, APESWAP].filter(Boolean);
    const paths = [
      pathDirect,
      pathViaUSDT,
    ].map(p => p.map(a => a.toLowerCase()));

    // ensure tokens in path are known replacements (BNB→WBNB)
    const fix = (a)=> a === "bnb" ? WBNB : a;
    const fixedPaths = paths.map(p => p.map(fix));

    for (const r of routers) {
      for (const p of fixedPaths) {
        try {
          const quote = await tryRouter(r, p);
          return res.json({ source: "DEX", ...quote });
        } catch (e) {
          console.warn("DEX try failed", r, p, e.message);
        }
      }
    }
    return res.status(404).json({ error: "No route on configured DEXes" });
  } catch (e) {
    console.error("quote error", e);
    return res.status(500).json({ error: e.message || "quote failed" });
  }
});

router.post("/buildTx", async (req, res) => {
  try {
    const { route } = req.body; // expecting {router, path, amountIn, minOut, to, deadline}
    if (!route) return res.status(400).json({ error: "route required" });

    const iface = new ethers.Interface([
      "function swapExactTokensForTokens(uint amountIn,uint amountOutMin,address[] calldata path,address to,uint deadline) returns (uint[] memory amounts)"
    ]);
    const data = iface.encodeFunctionData("swapExactTokensForTokens", [
      route.amountIn,
      route.minOut,
      route.path,
      route.to,
      route.deadline
    ]);
    res.json({
      to: route.router,
      data,
      value: "0x0" // using token → token (WBNB is ERC20)
    });
  } catch (e) {
    console.error("buildTx error", e);
    res.status(500).json({ error: e.message || "buildTx failed" });
  }
});

module.exports = router;
