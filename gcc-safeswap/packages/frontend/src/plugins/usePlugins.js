import { useMemo } from 'react';
import { PLUGINS } from './registry.js';
export default function usePlugins() {
  return useMemo(() => Object.entries(PLUGINS)
    .filter(([_, p]) => p.enabled)
    .map(([k, p]) => ({ key: k, ...p })), []);
}
