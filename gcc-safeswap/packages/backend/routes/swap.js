const express = require('express');
const { ethers } = require('ethers');
const { PANCAKE, APESWAP, WBNB } = require('../lib/routers.cjs');

const router = express.Router();
const routerAbi = [
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] path, address to, uint deadline) payable",
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)"
];

router.post('/build', async (req, res) => {
  try {
    const { account, routerAddr, path, sellAmount, buyAmount, slippageBps=200, reflectionBps=100 } = req.body || {};
    if (!account || !routerAddr || !Array.isArray(path)) return res.status(400).json({ error:"missing params" });

    // minOut includes slippage + reflection buffer
    const minOut = (BigInt(buyAmount) * BigInt(10_000 - slippageBps) / 10_000n) * BigInt(10_000 - reflectionBps) / 10_000n;

    const iface = new ethers.Interface(routerAbi);
    const deadline = Math.floor(Date.now()/1000) + 60*10; // 10m

    let to, data, value = "0x0";
    const sellsNative = /^0xEeee/i.test(path[0]) || path[0] === 'BNB';
    const buysNative  = /^0xEeee/i.test(path[path.length-1]) || path[path.length-1] === 'BNB';

    const finalPath = path.map(a => /^0xEeee/i.test(a) || a === 'BNB' ? WBNB : a);

    if (sellsNative) {
      data = iface.encodeFunctionData(
        "swapExactETHForTokensSupportingFeeOnTransferTokens",
        [minOut.toString(), finalPath, account, deadline]
      );
      value = ethers.toBeHex(sellAmount);
    } else if (buysNative) {
      data = iface.encodeFunctionData(
        "swapExactTokensForETHSupportingFeeOnTransferTokens",
        [sellAmount, minOut.toString(), finalPath, account, deadline]
      );
    } else {
      data = iface.encodeFunctionData(
        "swapExactTokensForTokensSupportingFeeOnTransferTokens",
        [sellAmount, minOut.toString(), finalPath, account, deadline]
      );
    }

    res.json({ to: routerAddr, data, value, minOut: minOut.toString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
