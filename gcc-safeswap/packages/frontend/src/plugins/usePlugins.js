import { useEffect, useState } from 'react';
import { PLUGIN_META } from './meta.js';
import { smartJoin } from '../lib/http';

// Fetch the backend plugin health endpoint and merge with static metadata
export default function usePlugins() {
  const [plugins, setPlugins] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(smartJoin(import.meta.env.VITE_API_BASE, '/api/plugins/health'));
        const j = await r.json();
        if (!alive) return;
        const pluginList = (j.plugins || []).filter(
          (p) =>
            import.meta.env.VITE_ENABLE_CONDOR_WALLET === 'true' ||
            p.name !== 'condor-wallet'
        );
        const items = pluginList.map((p) => ({
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
