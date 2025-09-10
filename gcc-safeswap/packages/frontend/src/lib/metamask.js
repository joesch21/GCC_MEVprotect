export const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export function dappDeepLink(origin) {
  const host = origin.replace(/^https?:\/\//,'');
  return `https://metamask.app.link/dapp/${host}`;
}

export function addNetworkDeepLink() {
  const p = new URLSearchParams({
    chainId: "56",
    chainName: "BNB Smart Chain (MEV Guard)",
    rpcUrl: "https://bscrpc.pancakeswap.finance",
    blockExplorerUrl: "https://bscscan.com",
    symbol: "BNB"
  });
  return `https://metamask.app.link/add-network?${p.toString()}`;
}
