import React from "react";
import { isCondor, isMetaMask, shortAddr } from "../lib/walletDetect";

export function HeaderBadge({ account }: { account?: string }) {
  const label = isCondor() ? "Condor" : (isMetaMask() ? "MetaMask" : "Wallet");
  return (
    <div className="chip chip--wallet">
      <span>Wallet: {label}</span>
      {account && <span className="addr">{shortAddr(account)}</span>}
    </div>
  );
}

