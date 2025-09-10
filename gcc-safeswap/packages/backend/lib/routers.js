const { ethers } = require("ethers");

const chainId = Number(process.env.CHAIN_ID || 56);
const PUBLIC_RPC = process.env.PUBLIC_RPC || process.env.RPC_URL_PUBLIC;
const provider = new ethers.JsonRpcProvider(PUBLIC_RPC, chainId);

const addrl = s => (s || "").toLowerCase();

function getTokens() {
  return {
    GCC: addrl(process.env.GCC_ADDRESS),
    WBNB: addrl(process.env.WBNB_ADDRESS),
    USDT: addrl(process.env.USDT_ADDRESS || process.env.TOKEN_USDT || ""),
  };
}
function getRouters() {
  return {
    PANCAKE: addrl(process.env.PANCAKE_ROUTER),
    APESWAP: addrl(process.env.APESWAP_ROUTER),
  };
}

module.exports = { provider, getRouters, getTokens };
