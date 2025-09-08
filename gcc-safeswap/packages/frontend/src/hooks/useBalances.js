import { BrowserProvider, Contract, formatUnits } from "ethers";
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

export async function erc20Balance(prov, tokenAddr, owner) {
  const erc = new Contract(tokenAddr, ERC20_ABI, prov);
  const [bal, dec] = await Promise.all([
    erc.balanceOf(owner),
    erc.decimals().catch(() => 18)
  ]);
  return { amount: formatUnits(bal, dec), decimals: Number(dec) || 18 };
}

export default function useBalances() {
  async function fetchBNBAndTokens(address, tokenMap) {
    if (!address) return {};
    const prov = new BrowserProvider(window.ethereum, "any");
    const out = {};
    // BNB
    const bn = await prov.getBalance(address);
    out.BNB = { amount: formatUnits(bn, 18), decimals: 18 };
    // ERC-20 set
    for (const [sym, addr] of Object.entries(tokenMap || {})) {
      try { out[sym] = await erc20Balance(prov, addr, address); } catch {}
    }
    return out;
  }
  return { fetchBNBAndTokens };
}
