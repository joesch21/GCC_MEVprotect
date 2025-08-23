const express = require('express');
const router = express.Router();

router.post('/submit', (_, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

module.exports = router;
