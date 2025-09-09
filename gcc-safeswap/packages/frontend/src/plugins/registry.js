export const PLUGINS = {
  'condor-wallet': {
    enabled: import.meta.env.VITE_ENABLE_CONDOR_WALLET === '1',
    title: 'Condor Wallet (Image Unlock)',
    lazy: () => import('./condorWallet/index.js')
  }
};
