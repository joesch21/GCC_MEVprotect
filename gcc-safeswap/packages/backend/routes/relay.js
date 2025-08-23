const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const PRIVATE_RPC_URL = process.env.PRIVATE_RPC_URL || 'https://bscrpc.pancakeswap.finance';

router.post('/sendRaw', async (req, res) => {
  try {
    const { rawTx, rpcUrl } = req.body;
    if (!rawTx) return res.status(400).json({ error: 'rawTx required' });
    const url = rpcUrl || PRIVATE_RPC_URL;
    const payload = { jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [rawTx] };
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
