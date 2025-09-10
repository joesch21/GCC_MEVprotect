const { ethers } = require('ethers');

const PANCAKE_IFACE = new ethers.utils.Interface([
  'function getAmountsOut(uint256,address[]) view returns (uint256[])'
]);

function makeRouter(provider, addr) {
  return new ethers.Contract(addr, PANCAKE_IFACE, provider);
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
