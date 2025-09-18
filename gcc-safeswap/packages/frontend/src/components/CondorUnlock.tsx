// packages/frontend/src/components/CondorUnlock.tsx
import { useState } from "react";
import { ethers } from "ethers";
import { decodePngToPrivateKey, privateKeyToWallet } from "../lib/condor/condor";

function getProvider() {
  const url =
    (import.meta as any)?.env?.VITE_BSC_RPC ?? "https://bsc-dataseed.binance.org";
  // @ts-ignore
  if (ethers?.providers?.JsonRpcProvider) {
    // v5
    // @ts-ignore
    return new ethers.providers.JsonRpcProvider(url);
  }
  // v6
  // @ts-ignore
  return new ethers.JsonRpcProvider(url);
}

export default function Unlocker() {
  const [msg, setMsg] = useState("");
  const [pass, setPass] = useState("");

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (!pass) throw new Error("Enter your passphrase");
      const pk = await decodePngToPrivateKey(file, pass);
      const provider = getProvider();
      const wallet = privateKeyToWallet(pk, provider);
      setMsg(`Unlocked wallet ${wallet.address}`);
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    }
  };

  return (
    <div>
      <input type="file" accept="image/png" onChange={onFile} />
      <input
        type="password"
        placeholder="Passphrase"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        style={{ display: "block", marginTop: 8 }}
      />
      <p>{msg}</p>
    </div>
  );
}
