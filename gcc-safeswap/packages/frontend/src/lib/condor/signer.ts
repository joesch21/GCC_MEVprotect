// packages/frontend/src/lib/condor/signer.ts
import { ethers } from "ethers";

/** ---------------- v5/v6 helpers (no hard type refs to ethers.providers) ---------------- */

type ProviderLike = string | any; // keep loose to avoid v5/v6 TS friction

function makeProvider(rpc: string): any {
  // v6: ethers.JsonRpcProvider ; v5: ethers.providers.JsonRpcProvider
  const anyE = ethers as any;
  if (anyE?.JsonRpcProvider) return new anyE.JsonRpcProvider(rpc);            // v6
  if (anyE?.providers?.JsonRpcProvider) return new anyE.providers.JsonRpcProvider(rpc); // v5
  throw new Error("No JsonRpcProvider found in ethers build");
}

function isV5StyleProvider(p: any): boolean {
  // duck-typing: v5 providers have sendTransaction that takes a populated tx
  return !!p && typeof p.sendTransaction === "function" && !p.broadcastTransaction;
}

function getBigIntCompat(x: any): bigint {
  const anyE = ethers as any;
  if (anyE.getBigInt) return anyE.getBigInt(x); // v6
  // v5 fallback
  const BN = anyE.BigNumber?.isBigNumber?.(x) ? x : anyE.BigNumber?.from?.(x);
  return BN ? BigInt(BN.toString()) : BigInt(x);
}

function toHexCompat(x: any): string {
  const anyE = ethers as any;
  if (anyE.toBeHex) return anyE.toBeHex(x); // v6
  const bi = getBigIntCompat(x);
  return "0x" + bi.toString(16);
}

function ensure0x64(pk: string) {
  const s = pk.startsWith("0x") ? pk : `0x${pk}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(s)) throw new Error("Invalid private key");
  return s;
}

/** ---------------- Types ---------------- */

export type LegacyTxFields = {
  to: string;
  data?: string;
  value?: string;   // 0x hex
  gasLimit: string; // 0x hex
  gasPrice: string; // 0x hex
  nonce: number;
  chainId: number;
  type: 0;
};

/** ---------------- Signer class ---------------- */

export class CondorSigner {
  privateKey: string;
  provider: any;
  wallet: any; // v5/v6 wallet

  constructor(pkHex: string, rpcOrProvider: ProviderLike) {
    this.privateKey = ensure0x64(pkHex);
    this.provider = typeof rpcOrProvider === "string" ? makeProvider(rpcOrProvider) : rpcOrProvider;

    const anyE = ethers as any;
    this.wallet = new anyE.Wallet(this.privateKey, this.provider); // v5 or v6
  }

  address(): string {
    return this.wallet.address;
  }

  /**
   * Build a legacy type-0 unsigned tx (BSC-friendly).
   * gasMult: e.g. 1.2 = +20% buffer
   */
  async buildUnsignedLegacyTx(
    to: string,
    data = "0x",
    value = "0x0",
    gasMult = 1.2,
    overrides: Partial<Pick<LegacyTxFields, "gasPrice" | "gasLimit" | "nonce">> = {}
  ): Promise<LegacyTxFields> {
    const [net, nonce, gasPrice, est] = await Promise.all([
      this.provider.getNetwork(),
      overrides.nonce ?? this.provider.getTransactionCount(this.wallet.address, "latest"),
      overrides.gasPrice ?? this.provider.getGasPrice(),
      this.provider.estimateGas({ from: this.wallet.address, to, data, value })
    ]);

    const estBI = getBigIntCompat(est);
    const limitBI = overrides.gasLimit
      ? getBigIntCompat(overrides.gasLimit)
      : (estBI * BigInt(Math.floor(gasMult * 100))) / 100n;

    return {
      to,
      data,
      value: toHexCompat(value),
      gasLimit: toHexCompat(limitBI),
      gasPrice: toHexCompat(gasPrice),
      nonce: Number(nonce),
      chainId: Number((net?.chainId ?? 0)),
      type: 0
    };
  }

  async signRaw(unsigned: LegacyTxFields, expectChainId?: number): Promise<string> {
    if (expectChainId != null && unsigned.chainId !== expectChainId) {
      throw new Error(`ChainId mismatch: unsigned=${unsigned.chainId} expected=${expectChainId}`);
    }
    const tx = {
      to: unsigned.to,
      data: unsigned.data ?? "0x",
      value: getBigIntCompat(unsigned.value ?? "0x0"),
      gasLimit: getBigIntCompat(unsigned.gasLimit),
      gasPrice: getBigIntCompat(unsigned.gasPrice),
      nonce: unsigned.nonce,
      chainId: unsigned.chainId,
      type: 0 as const
    };
    return await this.wallet.signTransaction(tx);
  }

  /** Broadcast a signed raw tx. Returns tx hash. */
  async sendRaw(raw: string): Promise<string> {
    if (isV5StyleProvider(this.provider)) {
      const r = await this.provider.sendTransaction(raw);          // v5
      return r?.hash ?? r;
    }
    if (typeof this.provider.broadcastTransaction === "function") {
      const r = await this.provider.broadcastTransaction(raw);     // v6
      return r?.hash ?? r;
    }
    // last-resort JSON-RPC
    const hash = await this.provider.send?.("eth_sendRawTransaction", [raw]);
    return hash;
  }
}

/** ---------------- Minimal in-memory “hook” API for your UI ----------------
 * Store the unlocked pk in memory (tab scope). No persistence.
 * This matches your previous import: { useCondorPrivateKey } from "../lib/condor/signer"
 * and gives you helpers to read/clear it.
 */

type CondorCtx = {
  signer: CondorSigner;
  address: string;
  provider: any;
};

let _condorCtx: CondorCtx | null = null;

/** Load a pk into memory and return a lightweight context */
export function useCondorPrivateKey(pkHex: string, rpc?: string | any): CondorCtx {
  const _rpc =
    rpc ||
    (import.meta as any)?.env?.VITE_BSC_RPC ||
    "https://bsc-dataseed.binance.org";

  const signer = new CondorSigner(pkHex, typeof _rpc === "string" ? makeProvider(_rpc) : _rpc);
  _condorCtx = { signer, address: signer.address(), provider: signer.provider };
  return _condorCtx;
}

/** Optional helpers for consumers */
export function getCondorContext(): CondorCtx | null {
  return _condorCtx;
}

export function forgetCondorSigner(): void {
  _condorCtx = null;
}
