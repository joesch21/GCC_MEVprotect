export function currentDappUrl() {
  const { protocol, host, pathname, search } = window.location;
  return `${protocol}//${host}${pathname}${search}`.replace(/\/+$/, "");
}

export async function connectInjected() {
  if (!window.ethereum) {
    throw new Error("No injected wallet found.");
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  return accounts[0];
}

export function condorDeepLink(url = currentDappUrl()) {
  const noProto = url.replace(/^https?:\/\//i, "");
  return `https://condorwallet.com/dapp/${noProto}`;
}

export function getCondorProvider(win: any = window) {
  const eth = win.ethereum;
  const providers = eth?.providers || [eth, win.condor].filter(Boolean);
  return providers.find((p: any) => p?.isCondor) || null;
}

export async function connectCondor() {
  const prov = getCondorProvider();
  if (!prov) {
    window.open(condorDeepLink(), "_blank");
    throw new Error("Condor not found — opening deep link.");
  }
  const accounts = await prov.request({ method: "eth_requestAccounts" });
  return accounts[0];
}
