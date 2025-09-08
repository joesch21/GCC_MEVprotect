import { parseUnits, formatUnits } from 'ethers';

export const parseAmount = (value, decimals) => {
  try {
    return parseUnits(value || '0', decimals);
  } catch {
    return 0n;
  }
};

export const formatAmount = (value, decimals) => {
  try {
    return formatUnits(value, decimals);
  } catch {
    return '0';
  }
};

export const fromBase = (value, decimals) => {
  try {
    return formatUnits(value, decimals);
  } catch {
    return '0';
  }
};

export const shorten = (addr) => addr ? addr.slice(0,6) + '...' + addr.slice(-4) : '';

export const toBase = (value, decimals) => {
  try { return parseUnits(value || '0', decimals).toString(); } catch { return '0'; }
};

export const pct = (num, den) => {
  const n = Number(num); const d = Number(den); return d ? (n / d) * 100 : 0;
};

export const bps = (num, den) => {
  const n = Number(num); const d = Number(den); return d ? (n / d) * 10000 : 0;
};
