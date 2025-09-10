import { useEffect, useState } from "react";
import { fetchPrivateBsc, enablePrivateBsc, isPrivate, markPrivate, ChainParams } from "../lib/privateRpc";

export function EnablePrivateRpc({ isCondor, isMetaMask, onEnabled }:{
  isCondor: boolean; isMetaMask: boolean; onEnabled?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(isPrivate());
  const [params, setParams] = useState<ChainParams | null>(null);

  useEffect(() => {
    if (!isMetaMask || enabled) return;
    fetchPrivateBsc().then(setParams).catch(() => {});
  }, [isMetaMask, enabled]);

  if (isCondor) return null; // Condor uses relay toggle instead
  if (!isMetaMask) return null;

  if (enabled) return <div className="chip chip--ok">Private RPC</div>;

  const deepLink = `https://metamask.app.link/dapp/${location.host}${location.pathname}`;

  return (
    <div className="card card--hint">
      <div className="muted">MetaMask users: enable our Private RPC for MEV-resistant routing.</div>
      <div className="row gap">
        <button disabled={busy || !params} onClick={async () => {
          try {
            setBusy(true);
            await enablePrivateBsc(params!);
            markPrivate();
            setEnabled(true);
            onEnabled && onEnabled();
            (window as any).__log?.("UI: Private RPC enabled", params);
          } finally { setBusy(false); }
        }}>
          {busy ? "Adding…" : "Enable Private RPC"}
        </button>
        <a className="ghost" href={deepLink} target="_blank" rel="noreferrer">
          Open in MetaMask App
        </a>
      </div>
      <small>We’ll show MetaMask’s “Add Network” prompt—approve once.</small>
    </div>
  );
}
