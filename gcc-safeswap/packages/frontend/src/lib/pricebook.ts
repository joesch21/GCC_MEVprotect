export type PriceBook = {
  updatedAt: string;
  stale: boolean;
  sources: string[];
  prices: { bnbUsd: number; gccUsd: number; gccBnb: number };
};

export async function getPriceBook(base = import.meta.env.VITE_API_BASE as string): Promise<PriceBook> {
  const url = `${base}/api/pricebook`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch {
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  return {
    updatedAt: new Date().toISOString(),
    stale: true,
    sources: [],
    prices: { bnbUsd: 0, gccUsd: 0, gccBnb: 0 },
  };
}
