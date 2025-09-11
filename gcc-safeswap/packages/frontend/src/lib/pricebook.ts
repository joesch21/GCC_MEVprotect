export type PriceBook = {
  updatedAt: string;
  stale: boolean;
  sources: string[];
  prices: { bnbUsd: number; gccBnb: number; gccUsd: number };
};

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function loadPriceBook(base = import.meta.env.VITE_API_BASE as string) {
  const url = `${base}/api/pricebook`;
  let attempt = 0;
  let lastErr: any;
  while (attempt < 3) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const pb = (await r.json()) as PriceBook;
      return pb;
    } catch (e) {
      lastErr = e;
      attempt++;
      await sleep(250 * attempt);
    }
  }
  return {
    updatedAt: new Date().toISOString(),
    stale: true,
    sources: [],
    prices: { bnbUsd: 0, gccBnb: 0, gccUsd: 0 },
  } as PriceBook;
}
