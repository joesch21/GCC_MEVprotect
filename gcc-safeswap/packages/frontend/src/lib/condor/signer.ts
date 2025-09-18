import { ethers } from "ethers";

let _pk: string | null = null;

function ensure0x64(pk: string) {
  const s = pk.startsWith("0x") ? pk : `0x${pk}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(s)) throw new Error("Invalid private key");
  return s;
}

type ProviderLike =
  | string
  | ethers.providers.JsonRpcProvider        // v5 (optional)
  | ethers.JsonRpcProvider                  // v6
  | ethers.AbstractProvider;                // v6 base

function toProvider(p?: ProviderLike): any {
  const url =
    (import.meta as any)?.env?.VITE_BSC_RPC ??
    "https://bscrpc.pancakeswap.finance";
  if (!p) {
    // @ts-ignore
    if (ethers?.providers?.JsonRpcProvider)
      return new (ethers as any).providers.JsonRpcProvider(url); // v5
    return new (ethers as any).JsonRpcProvider(url); // v6
  }
  if (typeof p === "string") {
    // @ts-ignore
    if (ethers?.providers?.JsonRpcProvider)
      return new (ethers as any).providers.JsonRpcProvider(p); // v5
    return new (ethers as any).JsonRpcProvider(p); // v6
  }
  return p;
}

/** Store the private key in-memory for this tab (session only). */
export function useCondorPrivateKey(pkHex: string) {
  _pk = ensure0x64(pkHex);
}

/** Forget the in-memory key. */
export function forgetCondorWallet() {
  _pk = null;
}

/** Get an ethers Wallet bound to a provider. Throws if no key set. */
export function getCondorWallet(providerLike?: ProviderLike): ethers.Wallet {
  if (!_pk) throw new Error("No Condor key loaded");
  const provider = toProvider(providerLike);
  // @ts-ignore v5/v6
  return new (ethers as any).Wallet(_pk, provider);
}

/** Back-compat: class used by older components (e.g., ConnectCondor). */
export class CondorSigner {
  privateKey: string;
  wallet: ethers.Wallet;
  provider: any;

  constructor(pkHex: string, rpcOrProvider?: ProviderLike) {
    this.privateKey = ensure0x64(pkHex);
    this.provider = toProvider(rpcOrProvider);
    // @ts-ignore v5/v6
    this.wallet = new (ethers as any).Wallet(this.privateKey, this.provider);
  }

  address() {
    return this.wallet.address;
  }

  /** Build a legacy (type 0) unsigned tx with a +20% gas buffer. */
  async buildUnsignedLegacyTx(
    to: string,
    data: string = "0x",
    value: string = "0x0"
  ) {
    const [net, nonce, gasPrice, est] = await Promise.all([
      this.provider.getNetwork(),
      this.provider.getTransactionCount(this.wallet.address, "latest"),
      this.provider.getGasPrice(),
      this.provider.estimateGas({ from: this.wallet.address, to, data, value }),
    ]);

    // +20% buffer (works for v5 BigNumber or v6 bigint)
    const estBig = (ethers as any).getBigInt
      ? (ethers as any).getBigInt(est)
      : est.mul
      ? est
      : (est as any);
    const limit = (
      estBig.mul
        ? estBig.mul(120).div(100)
        : (estBig * 120n) / 100n
    ) as any;

    return {
      to,
      data,
      value,
      gasLimit: (ethers as any).toBeHex
        ? (ethers as any).toBeHex(limit)
        : limit,
      gasPrice: (ethers as any).toBeHex
        ? (ethers as any).toBeHex(gasPrice)
        : gasPrice,
      nonce: Number(nonce),
      chainId: Number(net.chainId),
      type: 0 as const,
    };
  }

  async signRaw(unsigned: {
    to: string;
    data?: string;
    value?: string;
    gasLimit: string | any;
    gasPrice: string | any;
    nonce: number;
    chainId: number;
    type: 0;
  }) {
    const tx = {
      to: unsigned.to,
      data: unsigned.data ?? "0x",
      value: (ethers as any).getBigInt
        ? (ethers as any).getBigInt(unsigned.value ?? "0x0")
        : unsigned.value,
      gasLimit: (ethers as any).getBigInt
        ? (ethers as any).getBigInt(unsigned.gasLimit)
        : unsigned.gasLimit,
      gasPrice: (ethers as any).getBigInt
        ? (ethers as any).getBigInt(unsigned.gasPrice)
        : unsigned.gasPrice,
      nonce: unsigned.nonce,
      chainId: unsigned.chainId,
      type: 0 as const,
    };
    return await this.wallet.signTransaction(tx as any);
  }

  async sendRaw(raw: string): Promise<string> {
    if (this.provider?.sendTransaction) {
      const r = await this.provider.sendTransaction(raw);
      return r?.hash ?? r;
    }
    if (this.provider?.broadcastTransaction) {
      const r = await this.provider.broadcastTransaction(raw);
      return r?.hash ?? r;
    }
    const hash = await this.provider.send("eth_sendRawTransaction", [raw]);
    return hash;
  }
}
