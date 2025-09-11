import { ethers } from "ethers";

export type LegacyTxFields = {
  to: string;
  data?: string;
  value?: string;
  gasLimit: string;
  gasPrice: string;
  nonce: number;
  chainId: number;
  type: 0;
};

export class CondorSigner {
  privateKey: string;
  wallet: ethers.Wallet;
  provider: ethers.JsonRpcProvider;

  constructor(pkHex: string, rpcUrl: string) {
    this.privateKey = pkHex;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(pkHex, this.provider);
  }

  address() {
    return this.wallet.address;
  }

  async buildUnsignedLegacyTx(to: string, data = "0x", value = "0x0"): Promise<LegacyTxFields> {
    const [net, nonce, gasPrice, est] = await Promise.all([
      this.provider.getNetwork(),
      this.provider.getTransactionCount(this.wallet.address),
      this.provider.getGasPrice(),
      this.provider.estimateGas({ from: this.wallet.address, to, data, value })
    ]);
    const gasLimit = ethers.toBeHex(ethers.getBigInt(est) * 120n / 100n);
    return {
      to,
      data,
      value,
      gasLimit,
      gasPrice: ethers.toBeHex(gasPrice),
      nonce,
      chainId: net.chainId,
      type: 0
    };
  }

  async signRaw(unsigned: LegacyTxFields): Promise<string> {
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
    return await this.wallet.signTransaction(tx);
  }
}
