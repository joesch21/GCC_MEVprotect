const { Interface, Contract } = require('ethers');

const PANCAKE_IFACE = new Interface([
  'function swapExactTokensForTokens(uint amountIn,uint amountOutMin,address[] path,address to,uint deadline)',
  'function getAmountsOut(uint amountIn,address[] path) view returns (uint[] amounts)'
]);

function makeRouter(provider, addr) {
  return new Contract(addr, PANCAKE_IFACE, provider);
}

function normalizeToken(symbolOrAddr, { WBNB }) {
  if (!symbolOrAddr) return '';
  const s = symbolOrAddr.toLowerCase();
  if (s === 'bnb') return WBNB;
  return symbolOrAddr;
}

async function quoteViaRouter({ routerAddr, provider, amountIn, path }) {
  const router = makeRouter(provider, routerAddr);
  const amounts = await router.getAmountsOut(amountIn, path);
  return {
    router: routerAddr,
    path,
    amounts,
    buyAmount: amounts[amounts.length - 1].toString(),
    sellAmount: amounts[0].toString(),
  };
}

module.exports = {
  normalizeToken,
  quoteViaRouter,
};
