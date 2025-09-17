/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  readonly VITE_TOKEN_GCC: string
  readonly VITE_GCC_DECIMALS: string

  // RPCs
  readonly VITE_BSC_RPC: string
  readonly VITE_PUBLIC_BSC_RPC?: string

  // Condor Wallet WASM loader
  readonly VITE_CONDOR_WALLET_JS_URL: string
  readonly VITE_CONDOR_WALLET_WASM_URL: string

  // Relay service
  readonly VITE_RELAY_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
