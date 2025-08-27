const { JsonRpcProvider, Contract } = require('ethers');
const { ADDR } = require('../addresses');
const PAIR_ABI = require('../abi/IUniswapV2Pair.json');

const provider = new JsonRpcProvider(ADDR.PRIVATE_RPC_URL, 56);

async function getReserves(pair) {
  const c = new Contract(pair, PAIR_ABI, provider);
  const [r0, r1] = await c.getReserves();
  return { reserve0: r0.toString(), reserve1: r1.toString() };
}

module.exports = { getReserves };
