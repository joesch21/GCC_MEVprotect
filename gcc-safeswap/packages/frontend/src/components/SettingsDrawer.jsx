import React, { useEffect, useState, Suspense } from 'react';
import usePlugins from '../plugins/usePlugins.js';
import { EnablePrivateRpc } from './EnablePrivateRpc.tsx';

// Settings drawer displaying available plugins and lazily loading them
export default function SettingsDrawer({ open, onClose }) {
  const plugins = usePlugins();
  const [active, setActive] = useState(null);
  const [Pane, setPane] = useState(null);
  const isMetaMask = typeof window !== 'undefined' && window.ethereum?.isMetaMask;
  const isCondor = typeof window !== 'undefined' && window.condor?.isCondor;

  // Reset active pane when the drawer closes
  useEffect(() => {
    if (!open) {
      setActive(null);
      setPane(null);
    }
  }, [open]);

  async function openPlugin(p) {
    setActive(p.name);
    if (p.loader) {
      const mod = await p.loader();
      setPane(() => mod.default);
    } else {
      setPane(() => () => <div>Plugin has no UI</div>);
    }
  }

  if (!open) return null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="card" style={{ minWidth: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Settings & Plugins</h3>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <EnablePrivateRpc isCondor={isCondor} isMetaMask={isMetaMask} />
          {!active && (
            <>
              {plugins.length === 0 && <div className="muted">No plugins enabled.</div>}
              {plugins.map((p) => (
                <button key={p.name} className="btn" onClick={() => openPlugin(p)}>
                  <span style={{ marginRight: 8 }}>{p.icon}</span>
                  {p.title}
                </button>
              ))}
            </>
          )}

          {active && Pane && (
            <Suspense fallback={<div className="muted">Loading…</div>}>
              <Pane />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

