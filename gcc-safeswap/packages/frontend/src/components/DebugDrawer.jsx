import React, { useEffect, useState } from 'react';
import { getLogs, onLogChange, clearLogs } from '../lib/logger.js';

export default function DebugDrawer({ open, toggleLogs }) {
  const [entries, setEntries] = useState(getLogs());

  useEffect(() => onLogChange(setEntries), []);

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
    } catch {}
  };

  const clear = () => {
    clearLogs();
    setEntries([]);
  };

  return (
    <div className={`drawer ${open ? 'open' : ''}`}>
      <div className="drawer-head">
        <h3>Debug Log</h3>
        <div className="spacer" />
        <button className="btn tiny" onClick={copyLogs}>Copy</button>
        <button className="btn tiny" onClick={clear}>Clear</button>
        <button className="btn ghost" onClick={toggleLogs}>Close</button>
      </div>
      <pre className="logview">
        {entries.map((e, i) => `${e.ts} [${e.level}] ${e.msg}\n`).join('')}
      </pre>
    </div>
  );
}
