interface Eip1193Provider {
  isMetaMask?: boolean;
  isCondor?: boolean;
  request(args: { method: string; params?: any[] }): Promise<any>;
  on?(event: "accountsChanged" | "chainChanged", handler: (data: any) => void): void;
  removeListener?(event: "accountsChanged" | "chainChanged", handler: (data: any) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
    condor?: Eip1193Provider; // our wallet
  }
}
export {};
