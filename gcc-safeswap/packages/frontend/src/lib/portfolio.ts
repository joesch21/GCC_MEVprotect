import { BrowserProvider, Contract, formatEther, formatUnits } from "ethers";
import { getPriceBook } from "./pricebook";

const GCC = import.meta.env.VITE_TOKEN_GCC as string;
const GCC_DECIMALS = Number(import.meta.env.VITE_GCC_DECIMALS ?? 18);

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)"
];

export async function readBalances(
  provider: BrowserProvider,
  account: string
) {
  const [bnbWei, gccRaw] = await Promise.all([
    provider.getBalance(account),
    new Contract(GCC, ERC20_ABI, provider).balanceOf(account),
  ]);
  return {
    bnb: Number(formatEther(bnbWei)),
    gcc: Number(formatUnits(gccRaw, GCC_DECIMALS)),
  };
}

export async function computePortfolioUSD(
  provider: BrowserProvider,
  account: string
) {
  const [{ bnb, gcc }, pb] = await Promise.all([
    readBalances(provider, account),
    getPriceBook(),
  ]);
  const bnbUsd = pb.prices?.bnbUsd ?? 0;
  const gccUsd = pb.prices?.gccUsd ?? 0;
  const totalUsd = bnb * bnbUsd + gcc * gccUsd;
  return { bnb, gcc, bnbUsd, gccUsd, totalUsd, stale: pb.stale };
}
