import React, { useEffect, useState, useRef } from 'react';

export default function LogTail() {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState([]);
  const boxRef = useRef(null);

  useEffect(() => {
    const onLog = (e) => {
      const msg = typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail);
      setLines((prev) => {
        const next = [...prev, msg];
        return next.length > 500 ? next.slice(-500) : next;
      });
    };
    window.addEventListener('safeswap-log', onLog);
    return () => window.removeEventListener('safeswap-log', onLog);
  }, []);

  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [lines]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch (_) {}
  };

  const clear = () => setLines([]);

  return (
    <div className="logtail-wrap">
      <button
        type="button"
        className="debug-toggle"
        onClick={() => setOpen((v) => !v)}
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
          <pre ref={boxRef} className="debug-log__body">
            {lines.join('\n')}
          </pre>
        </div>
    </div>
  );
}

