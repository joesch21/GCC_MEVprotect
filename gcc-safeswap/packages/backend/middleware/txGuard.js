const { ALLOWLIST } = require('../safety/allowlist');

function txGuard(req, res, next) {
  if (process.env.TX_PAUSED === '1') {
    return res.status(503).json({ error: 'Transactions paused (Condor Shield)' });
  }
  const { to, chainId } = req.body || {};
  if (Number(chainId) !== ALLOWLIST.chainId) {
    return res.status(400).json({ error: 'Wrong network' });
  }
  if (!to || !ALLOWLIST.recipients.includes(String(to).toLowerCase())) {
    return res.status(403).json({ error: 'Recipient not in allow-list' });
  }
  return next();
}

module.exports = { txGuard };
