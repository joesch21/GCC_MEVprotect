module.exports = (app, env) => {
  const { summarize } = require('../config/env');
  app.get('/api/plugins/_health', (_,res)=> res.json({ ok:true, config: summarize() }));
};
