import { visibleTokens } from "../lib/tokens";

export default function TokenSelect({ value, onChange }) {
  const tokens = visibleTokens();
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      {tokens.map(t => (
        <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
      ))}
    </select>
  );
}
