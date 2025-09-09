module.exports = (app, env) => {
  const fetch = (...a)=>import('node-fetch').then(({default: f})=>f(...a));

  app.get('/api/0x/quote', async (req,res) => {
    if (!env.ZEROX_API_KEY) return res.status(404).json({ error: '0x disabled (no API key set)' });
    try{
      const url = new URL('https://bsc.api.0x.org/swap/v1/quote');
      Object.entries(req.query).forEach(([k,v]) => url.searchParams.set(k,v));
      const r = await fetch(url, { headers: { '0x-api-key': env.ZEROX_API_KEY }});
      const text = await r.text();
      if (!r.ok) return res.status(r.status).send(text);
      res.type('json').send(text);
    }catch(e){
      res.status(500).json({ error: e.message });
    }
  });
};
