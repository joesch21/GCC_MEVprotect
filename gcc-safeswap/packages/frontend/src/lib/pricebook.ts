const API_BASE = import.meta.env.VITE_API_BASE as string;

export type Pricebook = {
  BNB_USD?: number;
  GCC_USD?: number;
  GCC_BNB?: number;
  prices?: { BNB_USD?: number; GCC_USD?: number; GCC_BNB?: number };
  // accept any other shapes the backend might return
  [k: string]: any;
};

export async function getPrices(): Promise<{ bnbUsd: number; gccUsd: number }> {
  try {
    const res = await fetch(`${API_BASE}/api/pricebook`, { cache: "no-store" });
    if (!res.ok) throw new Error(`pricebook ${res.status}`);
    const pb: Pricebook = await res.json();

    // Try multiple shapes/keys safely
    const bnbUsd =
      Number(pb.BNB_USD ?? pb?.prices?.BNB_USD ?? pb?.bnbUsd ?? 0) || 0;

    // Prefer direct GCC_USD, else derive from GCC_BNB * BNB_USD
    const gccUsdDirect = Number(pb.GCC_USD ?? pb?.prices?.GCC_USD ?? 0) || 0;
    const gccBnb = Number(pb.GCC_BNB ?? pb?.prices?.GCC_BNB ?? 0) || 0;
    const gccUsd = gccUsdDirect || (gccBnb && bnbUsd ? gccBnb * bnbUsd : 0);

    return { bnbUsd, gccUsd };
  } catch (e) {
    // last-resort zeros (don't throw—avoids $0 flicker on network blips)
    return { bnbUsd: 0, gccUsd: 0 };
  }
}
