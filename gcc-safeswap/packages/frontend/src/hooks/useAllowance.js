import { BrowserProvider, Contract, ethers, Interface } from "ethers";
import { getRpcProvider } from "../lib/ethers";
import { API_BASE } from "../lib/apiBase.js";

export default function useAllowance() {
  async function ensure({ tokenAddr, owner, spender, amount, approveMax, serverSigner }) {
    if (!tokenAddr || tokenAddr.toLowerCase()==="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") return true;
    if (serverSigner) {
      const provider = getRpcProvider();
      const erc20 = new Contract(tokenAddr, ["function allowance(address owner, address spender) view returns (uint256)"], provider);
      const cur = await erc20.allowance(owner, spender);
      if (cur >= amount) return true;
      const value = approveMax ? ethers.MaxUint256 : amount;
      const iface = new Interface(["function approve(address spender, uint256 value)"]);
      const data = iface.encodeFunctionData("approve", [spender, value]);
      const tx = { to: tokenAddr, data, value: 0, chainId: 56 };
      const rawTx = await serverSigner.signTransaction(tx);
      const resp = await fetch(`${API_BASE}/api/relay/sendRaw`, { method: 'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ rawTx }) });
      const j = await resp.json();
      if (!resp.ok || j.error) throw new Error(j.error || 'relay failed');
      return true;
    }
    const prov = new BrowserProvider(window.ethereum); const signer = await prov.getSigner();
    const erc20 = new Contract(tokenAddr, [
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 value) returns (bool)"
    ], signer);
    const cur = await erc20.allowance(owner, spender);
    if (cur >= amount) return true;
    const value = approveMax ? ethers.MaxUint256 : amount;
    const tx = await erc20.approve(spender, value);
    await tx.wait();
    return true;
  }
  return { ensure };
}
