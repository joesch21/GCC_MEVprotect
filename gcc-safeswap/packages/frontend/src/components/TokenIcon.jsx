import React from "react";
const ICONS = {
  BNB: "/icons/bnb.svg",
  WBNB: "/icons/wbnb.svg",
  GCC: "/icons/gcc.svg",
  USDT: "/icons/usdt.svg",
  BTCB: "/icons/btcb.svg"
};
export default function TokenIcon({ symbol, size=18, style }) {
  const src = ICONS[symbol] || "/icons/unknown.svg";
  return <img src={src} alt={symbol} width={size} height={size} style={{verticalAlign:"middle",...style}} />;
}
