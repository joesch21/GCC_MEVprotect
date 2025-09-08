const bus = [];
export function log(...args){
  const line = { ts: Date.now(), text: args.map(a => {
    try { return typeof a === "string" ? a : JSON.stringify(a); }
    catch { return String(a); }
  }).join(" ") };
  bus.push(line);
  if (bus.length > 200) bus.shift();
  console.log("[SafeSwap]", ...args);
}
export function getLogs(){ return [...bus]; }
export function clearLogs(){ bus.length = 0; }

