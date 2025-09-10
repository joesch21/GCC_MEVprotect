import React, { useEffect, useState } from 'react';
import { getLogs, onLogChange, clearLogs } from '../lib/logger.js';

export default function DebugLogPanel() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState(getLogs());

  useEffect(() => onLogChange(setEntries), []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(entries, null, 2)); }
    catch (_) {}
  };

  const clear = () => { clearLogs(); setEntries([]); };

  return (
    <div className="logtail-wrap">
      <button
        type="button"
        className="debug-toggle"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        {open ? 'Hide Logs' : 'Show Logs'}
      </button>

      <div className="debug-log card" style={{ display: open ? 'block' : 'none' }}>
        <div className="debug-log__header">
          <span>Debug Log</span>
          <div className="actions">
            <button type="button" className="btn" onClick={copy}>Copy</button>
            <button type="button" className="btn" onClick={clear}>Clear</button>
          </div>
        </div>
        <ul className="debug-log__body log-list">
          {entries.slice(-200).map((e, i) => (
            <li key={i} data-level={e.level}>
              <div className="ts">{e.ts}</div>
              <div className="msg">{e.msg}</div>
              {e.data && <pre className="json">{JSON.stringify(e.data, null, 2)}</pre>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

