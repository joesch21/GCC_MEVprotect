module.exports = {
  enabled: ['condor-wallet'], // can be []
  settings: {
    'condor-wallet': {
      maxUploadBytes: 2_000_000,
      ttlSeconds: 900,
    },
  },
};
