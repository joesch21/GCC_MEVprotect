import { BrowserProvider, Contract, ethers } from "ethers";
export default function useAllowance() {
  async function ensure({ tokenAddr, owner, spender, amount, approveMax }) {
    if (!tokenAddr || tokenAddr.toLowerCase()==="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") return true;
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
