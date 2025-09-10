export type ChainParams = {
  chainIdHex: string;
  chainId: number;
  chainName: string;
  rpcUrls: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
  blockExplorerUrls: string[];
};

export async function fetchPrivateBsc(): Promise<ChainParams> {
  const r = await fetch("/api/private-rpc", { cache: "no-store" });
  if (!r.ok) throw new Error(`private-rpc ${r.status}`);
  return r.json();
}

export async function enablePrivateBsc(params: ChainParams) {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet detected");
  try {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: params.chainIdHex,
        chainName: params.chainName,
        nativeCurrency: params.nativeCurrency,
        rpcUrls: params.rpcUrls,
        blockExplorerUrls: params.blockExplorerUrls,
      }],
    });
  } catch (e: any) {
    // 4001 = user rejected; ignore
    if (e?.code !== 4001) console.debug("wallet_addEthereumChain", e);
  }
  await eth.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: params.chainIdHex }],
  });
}

// Local flag; wallets don’t disclose current RPC URL.
const FLAG = "bsc_private_enabled";
export const markPrivate = () => localStorage.setItem(FLAG, "1");
export const isPrivate = () => localStorage.getItem(FLAG) === "1";
