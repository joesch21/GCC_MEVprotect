const { isDenied, isWatched } = require('../mev/registry');

function mevGuard(req, res, next) {
  const { from } = req.body || {};
  const a = String(from || '').toLowerCase();
  if (!a) return res.status(400).json({ error: 'Missing sender' });

  if (isDenied(a)) return res.status(403).json({ error: 'Sender flagged as MEV' });
  if (isWatched(a)) req.headers['x-mev-watch'] = '1';
  next();
}

module.exports = { mevGuard };
