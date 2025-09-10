export function smartJoin(base, path) {
  if (!base) throw new Error("VITE_API_BASE missing");
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}
