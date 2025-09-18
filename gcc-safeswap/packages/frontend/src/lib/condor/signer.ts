// packages/frontend/src/lib/condor/signer.ts
import { ethers } from "ethers";

export type LegacyTxFields = {
  to: string;
  data?: string;
  value?: string;     // hex (0x..)
  gasLimit: string;   // hex
  gasPrice: string;   // hex
  nonce: number;
  chainId: number;
  type: 0;
};

type ProviderLike =
  | string
  | ethers.providers.JsonRpcProvider        // v5
  | ethers.JsonRpcProvider                  // v6
  | ethers.AbstractProvider;                // v6 base

function isV5Provider(p: any): p is ethers.providers.JsonRpcProvider {
  return !!p && !!p.getNetwork && !!ethers?.providers?.JsonRpcProvider && p instanceof (ethers as any).providers.JsonRpcProvider;
}

function toProvider(p: ProviderLike): any {
  if (typeof p === "string") {
    // v5 has ethers.providers.JsonRpcProvider; v6 has ethers.JsonRpcProvider
    // @ts-ignore
    if (ethers?.providers?.JsonRpcProvider) return new (ethers as any).providers.JsonRpcProvider(p); // v5
    return new (ethers as any).JsonRpcProvider(p); // v6
  }
  return p;
}

function ensure0x64(pk: string) {
  const s = pk.startsWith("0x") ? pk : `0x${pk}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(s)) throw new Error("Invalid private key");
  return s;
}

function toHex(v: bigint | string) {
  return typeof v === "bigint" ? ethers.toBeHex(v) : ethers.toBeHex(ethers.getBigInt(v));
}

export class CondorSigner {
  privateKey: string;
  wallet: ethers.Wallet;
  provider: any; // v5/v6 compatible provider

  constructor(pkHex: string, rpcOrProvider: ProviderLike) {
    this.privateKey = ensure0x64(pkHex);
    this.provider = toProvider(rpcOrProvider);
    // v5/v6 wallet both accept (pk, provider)
    // @ts-ignore
    this.wallet = new (ethers as any).Wallet(this.privateKey, this.provider);
  }

  address() {
    return this.wallet.address;
  }

  /**
   * Build a legacy type-0 unsigned tx for BSC (default).
   * @param gasMult safety multiplier (e.g., 1.2 = +20% buffer)
   * @param overrides manual gasPrice/gasLimit/nonce if you know them
   */
  async buildUnsignedLegacyTx(
    to: string,
    data: string = "0x",
    value: string = "0x0",
    gasMult = 1.2,
    overrides: Partial<Pick<LegacyTxFields, "gasPrice"|"gasLimit"|"nonce">> = {}
  ): Promise<LegacyTxFields> {
    const [net, nonce, gasPrice, est] = await Promise.all([
      this.provider.getNetwork(),
      overrides.nonce ?? this.provider.getTransactionCount(this.wallet.address, "latest"),
      overrides.gasPrice ?? this.provider.getGasPrice(),
      this.provider.estimateGas({ from: this.wallet.address, to, data, value })
    ]);

    // multiply estimate
    const estBig = ethers.getBigInt(est);
    const limit = overrides.gasLimit
      ? ethers.getBigInt(overrides.gasLimit)
      : (estBig * BigInt(Math.floor(gasMult * 100))) / 100n;

    return {
      to,
      data,
      value: toHex(value),
      gasLimit: toHex(limit),
      gasPrice: toHex(gasPrice),
      nonce: Number(nonce),
      chainId: Number(net.chainId),
      type: 0
    };
  }

  /**
   * Signs a legacy transaction. Optionally asserts expected chainId.
   */
  async signRaw(unsigned: LegacyTxFields, expectChainId?: number): Promise<string> {
    if (expectChainId != null && unsigned.chainId !== expectChainId) {
      throw new Error(`ChainId mismatch: unsigned=${unsigned.chainId} expected=${expectChainId}`);
    }
    const tx = {
      to: unsigned.to,
      data: unsigned.data ?? "0x",
      value: ethers.getBigInt(unsigned.value ?? "0x0"),
      gasLimit: ethers.getBigInt(unsigned.gasLimit),
      gasPrice: ethers.getBigInt(unsigned.gasPrice),
      nonce: unsigned.nonce,
      chainId: unsigned.chainId,
      type: 0 as const
    };
    return await this.wallet.signTransaction(tx as any);
  }

  /**
   * Broadcast a signed raw tx via the current provider.
   * Returns the tx hash.
   */
  async sendRaw(raw: string): Promise<string> {
    // v5: provider.sendTransaction; v6: provider.broadcastTransaction
    if (isV5Provider(this.provider) || this.provider?.sendTransaction) {
      const r = await this.provider.sendTransaction(raw);
      return r?.hash ?? r;
    }
    if (this.provider?.broadcastTransaction) {
      const r = await this.provider.broadcastTransaction(raw);
      return r?.hash ?? r;
    }
    // Fallback via JSON-RPC
    const hash = await this.provider.send("eth_sendRawTransaction", [raw]);
    return hash;
  }
}
