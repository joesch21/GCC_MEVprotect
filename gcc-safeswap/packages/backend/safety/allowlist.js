const ALLOWLIST = {
  chainId: 56,
  recipients: [
    process.env.GCC_ADDRESS,
    process.env.WBNB_ADDRESS,
    process.env.PANCAKE_ROUTER,
    process.env.APESWAP_ROUTER || ""
  ].filter(Boolean).map(a => a.toLowerCase())
};

module.exports = { ALLOWLIST };
