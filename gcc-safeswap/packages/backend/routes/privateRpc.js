const express = require("express");
const router = express.Router();

router.get("/", (_req, res) => {
  const url = process.env.PRIVATE_RPC;
  if (!url) return res.status(500).json({ error: "missing_private_rpc" });
  res.json({
    chainIdHex: "0x38",
    chainId: 56,
    chainName: "BNB Smart Chain • Private (Condor)",
    rpcUrls: [url],
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    blockExplorerUrls: ["https://bscscan.com"],
  });
});

module.exports = router;
