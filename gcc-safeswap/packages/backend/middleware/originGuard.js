const OK = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());

function originGuard(req, res, next) {
  const origin = req.get('origin') || '';
  if (OK.length && !OK.includes(origin)) return res.status(403).end();
  next();
}

module.exports = { originGuard };
