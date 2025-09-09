// Static metadata for plugins. The backend advertises which plugins are
// actually mounted and this table provides titles/icons/loaders for them.
export const PLUGIN_META = {
  'condor-wallet': {
    title: 'Condor Wallet (Image Unlock)',
    description:
      'Unlock a session signer by uploading a Condor image (experimental).',
    icon: '🪄',
    // Lazy importer (only fetched when the user opens the plugin)
    loader: () => import('./condorWallet/index.js'),
  },
};

