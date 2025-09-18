import { useState } from "react";
import { ethers } from "ethers";
import { decodePngToPrivateKey, privateKeyToWallet } from "../lib/condor/condor";

export default function Unlocker() {
  const [msg, setMsg] = useState("");

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const pk = await decodePngToPrivateKey(file, "your passphrase");
      const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org");
      const wallet = privateKeyToWallet(pk, provider);
      setMsg(`Unlocked wallet ${wallet.address}`);
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    }
  };

  return (
    <div>
      <input type="file" accept="image/png" onChange={onFile} />
      <p>{msg}</p>
    </div>
  );
}
