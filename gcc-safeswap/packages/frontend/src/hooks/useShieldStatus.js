import { useEffect, useState } from "react";
import { getBrowserProvider } from "../lib/ethers.js";

export default function useShieldStatus() {
  const [on, setOn] = useState(false);
  const [usedPrivate, setUsedPrivate] = useState(false);
  async function refresh() {
    try {
      const prov = getBrowserProvider();
      const chainIdHex = await prov.send("eth_chainId", []);
      const chainOk = chainIdHex === "0x38";
      setOn(chainOk && usedPrivate);
    } catch { setOn(false); }
  }
  useEffect(()=>{ refresh(); }, [usedPrivate]);
  return { shieldOn:on, markPrivateUsed:()=>setUsedPrivate(true), refreshShield:refresh };
}
