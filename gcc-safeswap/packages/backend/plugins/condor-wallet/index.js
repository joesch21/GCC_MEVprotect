const express = require('express');

const router = express.Router();

// POST /api/plugins/condor-wallet/upload
router.post('/upload', (_req, res) => {
  return res
    .status(501)
    .json({ error: 'Condor Wallet plugin not yet implemented' });
});

module.exports = router;

