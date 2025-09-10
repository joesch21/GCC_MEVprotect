import { useState } from "react";
import { isMetaMaskEnv, isCondorEnv, isMobileBrowser, buildMetaMaskDeeplink } from "../lib/walletDetect";

export function WalletConnect({ onConnected }:{ onConnected:()=>void }) {
  const [busy, setBusy] = useState(false);
  const mm = isMetaMaskEnv();
  const condor = isCondorEnv();
  const showDeepLink = isMobileBrowser(); // not already in MetaMask

  if (mm || condor) return null; // already in a wallet, let the main UI handle it

  return (
    <div className="card card--connect">
      <div className="title">Connect a wallet</div>
      <div className="row gap">
        <button
          onClick={async () => {
            try {
              setBusy(true);
              const eth:any = (window as any).ethereum;
              if (!eth?.request) throw new Error("No EIP-1193 provider found");
              await eth.request({ method: "eth_requestAccounts" });
              onConnected();
            } finally { setBusy(false); }
          }}
          disabled={busy}
        >
          {busy ? "Connecting…" : "Connect MetaMask"}
        </button>

        {showDeepLink && (
          <a className="ghost" href={buildMetaMaskDeeplink()} target="_blank" rel="noreferrer">
            Open in MetaMask App
          </a>
        )}
      </div>
      <small className="muted">You can also use Condor Wallet for private routing.</small>
    </div>
  );
}
