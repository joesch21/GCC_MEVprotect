import { useState } from "react";
import { isMetaMaskEnv, isMobileBrowser, buildMetaMaskDeeplink } from "../lib/walletDetect";
import ConnectCondor from "../features/wallets/ConnectCondor";

export function WalletConnect({ onConnected, condor, onForget }:{ onConnected:(ctx?:any)=>void; condor?:any; onForget?:()=>void }) {
  const [busy, setBusy] = useState(false);
  const [showCondor, setShowCondor] = useState(false);
  const mm = isMetaMaskEnv();
  const showDeepLink = isMobileBrowser(); // not already in MetaMask

  // always allow manual connections; no early return

  return (
    <div className="card card--connect">
      <div className="title">Connect a wallet</div>
      <div className="row gap">
        {mm && (
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
        )}

        {showDeepLink && mm && (
          <a className="ghost" href={buildMetaMaskDeeplink()} target="_blank" rel="noreferrer">
            Open in MetaMask App
          </a>
        )}

        <button onClick={() => setShowCondor(s => !s)} disabled={busy}>
          Connect Condor Wallet
        </button>
      </div>
      {showCondor && !condor && (
        <div className="mt-4">
          <ConnectCondor onConnected={(ctx) => { onConnected(ctx); setShowCondor(false); }} />
        </div>
      )}
      {condor && (
        <div className="mt-4 space-y-2">
          <div className="muted">Connected: {condor.address.slice(0,6)}…{condor.address.slice(-4)}</div>
          {onForget && <button className="ghost" onClick={onForget}>Forget Wallet</button>}
        </div>
      )}
    </div>
  );
}
