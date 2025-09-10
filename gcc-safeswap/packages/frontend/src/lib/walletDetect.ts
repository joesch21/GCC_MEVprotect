export function isCondorProvider(eth: any) {
  return !!eth?.isCondor || !!(window as any).condor?.isCondor;
}
export function isMetaMaskProvider(eth: any) {
  return !!eth?.isMetaMask;
}
