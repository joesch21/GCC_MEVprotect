const express = require("express");
const { ethers } = require("ethers");
const router = express.Router();

const WBNB = (process.env.WBNB || "0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c").toLowerCase();
const APE = process.env.APE_ROUTER || "0xC0788A3aD43d79aa53B09c2EaCc313A787d1d607";
const PCS = process.env.PCS_ROUTER || "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PRC = process.env.PRIVATE_RPC_URL || "https://bscrpc.pancakeswap.finance";

const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)"
];
const SWAP_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)",
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)"
];

const toBN = (x) => ethers.getBigInt(x);
const addr = (x) => (x || "").toLowerCase();
const isBNB = (x) => x === "BNB";

function toRouterToken(x){ return isBNB(x) ? WBNB : addr(x); }

function makePath(sell, buy){
  const s = toRouterToken(sell);
  const b = toRouterToken(buy);
  if (!s || !b || s === b) return null;
  return (s === WBNB || b === WBNB) ? [s, b] : [s, WBNB, b];
}

async function bestRouterQuote(provider, amountIn, path, routers){
  let best = null;
  for (const raddr of routers){
    try{
      const r = new ethers.Contract(raddr, ROUTER_ABI, provider);
      const amounts = await r.getAmountsOut(amountIn, path);
      const out = amounts[amounts.length-1];
      if (!best || out > best.buy) best = { router: raddr, amounts, buy: out };
    }catch(_){}
  }
  return best;
}

router.get("/quote", async (req, res) => {
  try{
    const chainId = Number(req.query.chainId || 56);
    const sellToken = req.query.sellToken;
    const buyToken = req.query.buyToken;
    const sellAmount = toBN(req.query.sellAmount || "0");
    if (!sellToken || !buyToken || !sellAmount) {
      console.error("DEXQUOTE missing param", { sellToken, buyToken, sellAmount: String(sellAmount) });
      return res.status(400).json({ error: "sellToken,buyToken,sellAmount required" });
    }

    const provider = new ethers.JsonRpcProvider(PRC, chainId);
    const path = makePath(sellToken, buyToken);
    if (!path) {
      console.error("DEXQUOTE invalid path", { sellToken, buyToken });
      return res.status(400).json({ error: "invalid path" });
    }

    const best = await bestRouterQuote(provider, sellAmount, path, [APE, PCS]);
    if (!best) {
      console.error("DEXQUOTE no router could quote", { sellToken, buyToken, amount: String(sellAmount) });
      return res.status(404).json({ error: "no router could quote" });
    }

    res.json({
      chainId,
      router: best.router,
      path,
      sellAmount: sellAmount.toString(),
      buyAmount: best.buy.toString(),
      amounts: best.amounts.map(a=>a.toString())
    });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

router.post("/buildTx", async (req, res) => {
  try{
    const { from, sellToken, buyToken, amountIn, quoteBuy, routerAddr, slippageBps = 50 } = req.body || {};
    if (!from || !sellToken || !buyToken || !amountIn) {
      console.error("DEXBUILD missing param", { from, sellToken, buyToken, amountIn });
      return res.status(400).json({ error: "from,sellToken,buyToken,amountIn required" });
    }

    const provider = new ethers.JsonRpcProvider(PRC, 56);
    const router = new ethers.Contract(routerAddr || APE, SWAP_ABI, provider);
    const path = makePath(sellToken, buyToken);
    if (!path) {
      console.error("DEXBUILD invalid path", { sellToken, buyToken });
      return res.status(400).json({ error: "invalid path" });
    }

    const deadline = Math.floor(Date.now()/1000) + 600;
    const minOut = quoteBuy
      ? (toBN(quoteBuy) * toBN(10000 - Number(slippageBps))) / toBN(10000)
      : toBN(0);

    const iface = router.interface;
    let tx;
    if (isBNB(sellToken)){
      tx = {
        to: router.target,
        value: ethers.toBeHex(amountIn),
        data: iface.encodeFunctionData("swapExactETHForTokens", [minOut, path, from, deadline])
      };
    } else if (isBNB(buyToken)){
      tx = {
        to: router.target,
        data: iface.encodeFunctionData("swapExactTokensForETHSupportingFeeOnTransferTokens", [amountIn, minOut, path, from, deadline])
      };
    } else {
      tx = {
        to: router.target,
        data: iface.encodeFunctionData("swapExactTokensForTokensSupportingFeeOnTransferTokens", [amountIn, minOut, path, from, deadline])
      };
    }
    res.json({ ...tx, allowanceTarget: router.target });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

module.exports = router;

