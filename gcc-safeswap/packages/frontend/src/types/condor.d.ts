interface Eip1193 {
  isCondor?: boolean;
  request(args:{ method:string; params?: any[] }): Promise<any>;
  on?(ev:"accountsChanged"|"chainChanged", h:(p:any)=>void): void;
  removeListener?(ev:"accountsChanged"|"chainChanged", h:(p:any)=>void): void;
}
declare global {
  interface Window {
    condor?: Eip1193;
    ethereum?: Eip1193 & { providers?: Eip1193[]; isMetaMask?: boolean };
  }
}
export type { Eip1193 };
export {};
