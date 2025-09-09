import { useEffect, useState } from 'react';
import { PLUGIN_META } from './meta.js';

// Fetch the backend plugin health endpoint and merge with static metadata
export default function usePlugins() {
  const [plugins, setPlugins] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/plugins/_health');
        const j = await r.json();
        if (!alive) return;
        const items = (j.plugins || []).map((p) => ({
          name: p.name,
          ...(PLUGIN_META[p.name] || {
            title: p.name,
            description: '',
            icon: '🧩',
          }),
        }));
        setPlugins(items);
      } catch {
        // If the backend has no plugin router mounted, return an empty list
        setPlugins([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Returns array of {name, title, description, icon, loader}
  return plugins;
}

