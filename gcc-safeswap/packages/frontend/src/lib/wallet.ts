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

export function condorDeepLink(url = currentDappUrl()) {
  const noProto = url.replace(/^https?:\/\//i, "");
  return `https://condorwallet.com/dapp/${noProto}`;
}

export async function connectCondor() {
  const prov = (window as any).condor || (window as any).ethereum?.providers?.find?.((p: any) => p.isCondor);
  if (!prov) {
    window.open(condorDeepLink(), "_blank");
    throw new Error("Condor not found — opening deep link.");
  }
  const accounts = await prov.request({ method: "eth_requestAccounts" });
  return accounts[0];
}

export async function ensureBscMainnet(providerOverride?: any) {
  const prov = providerOverride || window.ethereum;
  const provider = new BrowserProvider(prov);
  const net = await provider.getNetwork();
  if (net.chainId !== 56n) {
    try {
      await prov.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BSC_MAINNET.chainId }],
      });
    } catch (e) {
      await prov.request({
        method: "wallet_addEthereumChain",
        params: [BSC_MAINNET],
      });
    }
  }
}
