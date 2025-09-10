export function detectCaps(ethereum: any, win?: any) {
  const isMetaMask = !!ethereum?.isMetaMask;
  const providers = ethereum?.providers || [ethereum, win?.condor].filter(Boolean);
  const isCondor = providers.some((p: any) => p?.isCondor);
  return { isMetaMask, isCondor };
}
