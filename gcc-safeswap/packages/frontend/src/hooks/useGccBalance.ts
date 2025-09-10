import { useEffect, useState } from "react";
import { BrowserProvider, Contract, formatUnits } from "ethers";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

export default function useGccBalance(tokenAddress: string | undefined, account?: string | null) {
  const [balance, setBalance] = useState<number | null>(null);
  const [raw, setRaw] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<null | string>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErr(null);
      if (!account || !tokenAddress) { setBalance(null); return; }
      try {
        const hasEth = typeof window !== "undefined" && (window as any).ethereum;
        if (!hasEth) return;

        const prov = new BrowserProvider((window as any).ethereum);
        const network = await prov.getNetwork();
        // Expect BNB Chain (56 / 0x38)
        if (Number(network.chainId) !== 56) {
          setErr("Wrong network (switch to BNB Chain).");
          setBalance(null);
          return;
        }

        const erc20 = new Contract(tokenAddress, ERC20_ABI, prov);
        const [rawBal, dec] = await Promise.all([erc20.balanceOf(account), erc20.decimals()]);
        if (!cancelled) {
          setBalance(Number(formatUnits(rawBal, dec)));
          setRaw(rawBal);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.debug("GCC balance error:", e);
          setErr(e?.message || "balance error");
          setBalance(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    load();

    // re-run when MM fires account/chain changes (Safari-friendly)
    const eth = (typeof window !== "undefined" && (window as any).ethereum) || null;
    const onAcc = () => load();
    const onChain = () => load();
    if (eth?.on) {
      eth.on("accountsChanged", onAcc);
      eth.on("chainChanged", onChain);
    }

    // gentle polling safety (30s) in case events are dropped
    const id = setInterval(load, 30000);

    return () => {
      cancelled = true;
      clearInterval(id);
      if (eth?.removeListener) {
        eth.removeListener("accountsChanged", onAcc);
        eth.removeListener("chainChanged", onChain);
      }
    };
  }, [account, tokenAddress]);

  return { balance, raw, loading, err };
}
