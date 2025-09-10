export function detectCaps(ethereum: any, otherProviders?: any) {
  const isMetaMask = !!ethereum?.isMetaMask;
  const isCondor   = !!(ethereum?.isCondor || (otherProviders?.condor?.isCondor));
  return { isMetaMask, isCondor };
}
