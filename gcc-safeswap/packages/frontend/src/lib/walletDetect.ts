export const isMetaMask = () => !!(window as any).ethereum?.isMetaMask;
export const isCondor   = () => !!(window as any).ethereum?.isCondor || !!(window as any).condor?.isCondor;

// backwards compat exports
export const isMetaMaskEnv = isMetaMask;
export const isCondorEnv   = isCondor;

export const shortAddr = (a?: string) => (a ? `${a.slice(0,6)}…${a.slice(-4)}` : "");

export const isMobileBrowser = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
                                     !isMetaMask(); // exclude in-app MM webview

export function buildMetaMaskDeeplink(): string {
  // dapp deeplink preserves path & query
  const origin = location.host;              // e.g. gcc-me-vprotect.vercel.app
  const path   = location.pathname + location.search + location.hash;
  // IMPORTANT: use https scheme, MetaMask requires https
  return `https://metamask.app.link/dapp/${origin}${path}`;
}
