export const ICON_MAP = {
  BNB:  "/icons/bnb.svg",
  WBNB: "/icons/wbnb.svg",
  GCC:  "/icons/gcc.svg",
  USDT: "/icons/usdt.svg",
  BTCB: "/icons/btcb.svg"
};

const TOKENS = {
  BNB:  { symbol:"BNB",  address:"0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", decimals:18, isNative:true, name:"BNB", icon: ICON_MAP.BNB },
  WBNB: { symbol:"WBNB", address:"0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals:18, name:"Wrapped BNB", icon: ICON_MAP.WBNB },
  GCC:  { symbol:"GCC",  address:"0x092aC429b9c3450c9909433eB0662c3b7c13cF9A", decimals:18, name:"Global Currency", icon: ICON_MAP.GCC },
  USDT: { symbol:"USDT", address:"0x55d398326f99059fF775485246999027B3197955", decimals:18, name:"Tether USD", icon: ICON_MAP.USDT },
  BTCB: { symbol:"BTCB", address:"0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals:18, name:"Bitcoin B", icon: ICON_MAP.BTCB }
};

export default TOKENS;
