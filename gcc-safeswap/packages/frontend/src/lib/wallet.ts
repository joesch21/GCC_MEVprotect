import { BrowserProvider } from "ethers";

export const BSC_MAINNET = {
  chainId: "0x38",
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.binance.org/"],
  blockExplorerUrls: ["https://bscscan.com/"],
};

export function currentDappUrl() {
  const { protocol, host, pathname, search } = window.location;
  return `${protocol}//${host}${pathname}${search}`.replace(/\/+$/, "");
}

export function metamaskDeepLink(url = currentDappUrl()) {
  const noProto = url.replace(/^https?:\/\//i, "");
  return `https://metamask.app.link/dapp/${noProto}`;
}

export async function connectInjected() {
  if (!window.ethereum) {
    window.open(metamaskDeepLink(), "_blank");
    throw new Error("MetaMask not found — opening deep link.");
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  return accounts[0];
}

export async function ensureBscMainnet() {
  const provider = new BrowserProvider(window.ethereum);
  const net = await provider.getNetwork();
  if (net.chainId !== 56n) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BSC_MAINNET.chainId }],
      });
    } catch (e) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [BSC_MAINNET],
      });
    }
  }
}
