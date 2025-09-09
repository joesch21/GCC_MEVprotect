export function isMobile() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function dappDeepLink(origin) {
  // Must be a public/lan host, not localhost for mobile
  const host = origin.replace(/^https?:\/\//, "");
  return `https://metamask.app.link/dapp/${host}`;
}

// BNB Private RPC add network deep link (MetaMask supports these params)
export function addNetworkDeepLink() {
  const params = new URLSearchParams({
    chainId: "56",
    chainName: "BNB Smart Chain (MEV Guard)",
    rpcUrl: "https://bscrpc.pancakeswap.finance",
    blockExplorerUrl: "https://bscscan.com",
    symbol: "BNB"
  });
  return `https://metamask.app.link/add-network?${params.toString()}`;
}
