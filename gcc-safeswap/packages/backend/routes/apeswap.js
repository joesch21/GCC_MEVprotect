const express = require('express');
const { JsonRpcProvider, Contract, Interface } = require('ethers');
const { ADDR } = require('../addresses');
const RouterABI = require('../abi/IUniswapV2Router02.json');
const PairABI = require('../abi/IUniswapV2Pair.json');

const router = express.Router();
const provider = new JsonRpcProvider(ADDR.PRIVATE_RPC_URL);
const routerContract = new Contract(ADDR.APEBOND_ROUTER, RouterABI, provider);

const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

function normalize(token) {
  return token === NATIVE ? ADDR.WBNB : token;
}

function buildPath(sellToken, buyToken) {
  sellToken = normalize(sellToken);
  buyToken = normalize(buyToken);
  let path = [sellToken, buyToken];
  if ((sellToken === ADDR.GCC && buyToken !== ADDR.WBNB) || (buyToken === ADDR.GCC && sellToken !== ADDR.WBNB)) {
    path = [sellToken, ADDR.WBNB, buyToken];
  }
  if ((sellToken === ADDR.GCC && buyToken === ADDR.BTCB) || (sellToken === ADDR.BTCB && buyToken === ADDR.GCC)) {
    path = [sellToken, ADDR.WBNB, buyToken];
  }
  return path;
}

router.get('/route', (req, res) => {
  const { sellToken, buyToken } = req.query;
  if (!sellToken || !buyToken) return res.status(400).json({ error: 'sellToken & buyToken required' });
  const path = buildPath(sellToken, buyToken);
  res.json({ path });
});

router.get('/amountsOut', async (req, res) => {
  try {
    const { sellToken, buyToken, amountIn } = req.query;
    if (!sellToken || !buyToken || !amountIn) return res.status(400).json({ error: 'sellToken, buyToken, amountIn required' });
    const path = buildPath(sellToken, buyToken);
    const amounts = await routerContract.getAmountsOut(amountIn, path);
    res.json({ amounts: amounts.map(a => a.toString()), path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pairReserves', async (req, res) => {
  try {
    const { pair } = req.query;
    if (!pair) return res.status(400).json({ error: 'pair required' });
    const pairC = new Contract(pair, PairABI, provider);
    const [reserve0, reserve1] = await pairC.getReserves();
    const token0 = await pairC.token0();
    const token1 = await pairC.token1();
    res.json({ reserve0: reserve0.toString(), reserve1: reserve1.toString(), token0, token1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/buildTx', async (req, res) => {
  try {
    const { from, sellToken, buyToken, amountIn, minAmountOut } = req.body;
    if (!from || !sellToken || !buyToken || !amountIn || !minAmountOut) return res.status(400).json({ error: 'missing fields' });
    const iface = new Interface(RouterABI);
    const deadline = Math.floor(Date.now() / 1000) + 600;
    let path = buildPath(sellToken, buyToken);
    let data;
    let value = '0';
    if (sellToken === NATIVE) {
      path = buildPath(ADDR.WBNB, buyToken);
      data = iface.encodeFunctionData('swapExactETHForTokens', [minAmountOut, path, from, deadline]);
      value = amountIn;
    } else if (buyToken === NATIVE) {
      path = buildPath(sellToken, ADDR.WBNB);
      data = iface.encodeFunctionData('swapExactTokensForETH', [amountIn, minAmountOut, path, from, deadline]);
    } else {
      data = iface.encodeFunctionData('swapExactTokensForTokensSupportingFeeOnTransferTokens', [amountIn, minAmountOut, path, from, deadline]);
    }
    res.json({ to: ADDR.APEBOND_ROUTER, data, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
