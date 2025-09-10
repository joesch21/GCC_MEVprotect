// super lightweight log buffer for the UI panel
const MAX = 500;
const buf = [];

export function nowISO() { return new Date().toISOString(); }

export function log(level, msg, data) {
  // avoid storing huge blobs
  const safe = data && JSON.parse(JSON.stringify(data, (_k, v) =>
    typeof v === "string" && v.length > 500 ? v.slice(0, 500) + "…[trunc]" : v
  ));
  buf.push({ ts: nowISO(), level, msg, data: safe });
  if (buf.length > MAX) buf.shift();
  if (window.__GCC_LOG_LISTENERS__) {
    window.__GCC_LOG_LISTENERS__.forEach(fn => fn([...buf]));
  }
}

export const logInfo  = (m, d) => log("info",  m, d);
export const logWarn  = (m, d) => log("warn",  m, d);
export const logError = (m, d) => log("error", m, d);
export function getLogs() { return [...buf]; }
export function clearLogs() { buf.length = 0; }
export function onLogChange(fn) {
  window.__GCC_LOG_LISTENERS__ = window.__GCC_LOG_LISTENERS__ || [];
  window.__GCC_LOG_LISTENERS__.push(fn);
  return () => {
    window.__GCC_LOG_LISTENERS__ = window.__GCC_LOG_LISTENERS__.filter(x => x !== fn);
  };
}

