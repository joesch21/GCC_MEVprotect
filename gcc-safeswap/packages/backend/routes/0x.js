const express = require('express');
const router = express.Router();
const log = console;
const fetch = (...a)=>import('node-fetch').then(({default: f})=>f(...a));

router.get('/quote', async (req, res) => {
  try {
    const sellToken = mapBnb(req.query.sellToken);
    const buyToken  = mapBnb(req.query.buyToken);

    const url = new URL('https://bsc.api.0x.org/swap/v1/quote');
    url.search = new URLSearchParams({
      chainId: '56',
      ...req.query,
      sellToken, buyToken
    }).toString();

    const r = await fetch(url, {
      headers: { '0x-api-key': process.env.ZEROX_API_KEY || '' }
    });

    const text = await r.text();
    log.info('0x QUOTE', { status: r.status, url: url.toString(), body: safeTrunc(text) });

    if (!r.ok) return res.status(r.status).send(text);
    res.type('application/json').send(text);
  } catch (e) {
    log.error('0x QUOTE ERR', { msg: e.message, stack: e.stack });
    res.status(502).json({ error: '0x upstream error' });
  }
});

function mapBnb(addrOrSymbol){
  if (!addrOrSymbol) return addrOrSymbol;
  const sym = String(addrOrSymbol).toUpperCase();
  if (sym === 'BNB') return process.env.WBNB_ADDRESS;
  return addrOrSymbol;
}
function safeTrunc(s){ return String(s).slice(0, 800); }

module.exports = router;
