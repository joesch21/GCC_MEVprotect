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

export const shorten = (addr) => addr ? addr.slice(0,6) + '...' + addr.slice(-4) : '';
