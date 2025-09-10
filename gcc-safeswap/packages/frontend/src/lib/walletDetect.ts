export const isMetaMaskEnv = () => !!(window as any).ethereum?.isMetaMask;
export const isCondorEnv   = () => !!(window as any).ethereum?.isCondor || !!(window as any).condor?.isCondor;

export const isMobileBrowser = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
                                     !isMetaMaskEnv(); // exclude in-app MM webview

export function buildMetaMaskDeeplink(): string {
  // dapp deeplink preserves path & query
  const origin = location.host;              // e.g. gcc-me-vprotect.vercel.app
  const path   = location.pathname + location.search + location.hash;
  // IMPORTANT: use https scheme, MetaMask requires https
  return `https://metamask.app.link/dapp/${origin}${path}`;
}
