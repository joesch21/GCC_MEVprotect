import React, { useState, Suspense } from 'react';
import usePlugins from '../plugins/usePlugins.js';

export default function SettingsDrawer({ onServerSigner, onUseServer }) {
  const plugins = usePlugins();
  const [active, setActive] = useState(null);
  if (!plugins.length) return null;
  const Active = active ? React.lazy(active.lazy) : null;
  return (
    <div className="settings-drawer">
      <div className="plugin-tiles" style={{display:'flex', gap:8}}>
        {plugins.map(p => (
          <button key={p.key} onClick={() => setActive(p)}>{p.title}</button>
        ))}
      </div>
      {Active && (
        <Suspense fallback={<div>Loading…</div>}>
          <Active onClose={() => setActive(null)} onServerSigner={onServerSigner} onUseServer={onUseServer} />
        </Suspense>
      )}
    </div>
  );
}
