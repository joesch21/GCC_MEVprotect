const ADDR = {
  // Tokens
  GCC:  process.env.GCC_TOKEN_ADDRESS  || "0x092aC429b9c3450c9909433eB0662c3b7c13cF9A",
  WBNB: process.env.WBNB_ADDRESS       || "0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  BTCB: process.env.BTCB_ADDRESS       || "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
  USDT: process.env.USDT_ADDRESS       || "0x55d398326f99059fF775485246999027B3197955",

  // LPs (for route hints / reserves)
  LP_GCC_WBNB_PCS: process.env.LP_GCC_WBNB_PCS || "0x3d32d359bdad07C587a52F8811027675E4f5A833",
  LP_GCC_BTCB_PCS: process.env.LP_GCC_BTCB_PCS || "0xe455556e986ca45a39d3FDf28D69E4A9f6326212",
  LP_GCC_WBNB_APE: process.env.LP_GCC_WBNB_APE || "0x5d5Af3462348422B6A6b110799FcF298CFc041D3",

  // ApeSwap Router (BNB)
  APEBOND_ROUTER:  process.env.APEBOND_ROUTER_ADDRESS || "0xC0788A3aD43d79aa53B09c2EaCc313A787d1d607",

  // Private RPC (MEV-shield)
  PRIVATE_RPC_URL: process.env.PRIVATE_RPC_URL || "https://bscrpc.pancakeswap.finance"
};

module.exports = { ADDR };
