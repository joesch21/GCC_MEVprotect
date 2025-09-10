import { BrowserProvider, Contract, formatEther, formatUnits } from "ethers";

const GCC = import.meta.env.VITE_TOKEN_GCC as string;
const GCC_DECIMALS = Number(import.meta.env.VITE_GCC_DECIMALS ?? 18);
const API_BASE = import.meta.env.VITE_API_BASE as string;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

export async function getBalancesUSD(provider: BrowserProvider, account: string) {
  const [bnbWei, pricebook] = await Promise.all([
    provider.getBalance(account),
    fetch(`${API_BASE}/api/pricebook`).then(r => r.json())
  ]);

  const bnb = Number(formatEther(bnbWei));
  const bnbUsd = Number(pricebook.BNB_USD ?? 0);

  const erc20 = new Contract(GCC, ERC20_ABI, provider);
  const gccRaw: bigint = await erc20.balanceOf(account);
  const gcc = Number(formatUnits(gccRaw, GCC_DECIMALS));

  let gccUsd = Number(pricebook.GCC_USD ?? 0);
  if (!gccUsd && pricebook.GCC_BNB && bnbUsd) gccUsd = Number(pricebook.GCC_BNB) * bnbUsd;

  const totalUsd = (bnb * bnbUsd) + (gcc * gccUsd);

  return {
    bnb, gcc, bnbUsd, gccUsd, totalUsd
  };
}
