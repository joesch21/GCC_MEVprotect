const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('crypto');
const { Wallet } = require('ethers');
const imageUnlock = require('./imageUnlock');
const config = require('../../plugins.config.cjs').settings['condor-wallet'];

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') cb(null, true);
    else cb(new Error('Only PNG/JPEG images allowed'));
  }
});

router.use(rateLimit({ windowMs: 60_000, max: 10 }));

const sessions = new Map();

function getSession(id) {
  const sess = sessions.get(id);
  if (!sess) return null;
  if (Date.now() - sess.createdAt > config.ttlSeconds * 1000) {
    sessions.delete(id);
    return null;
  }
  return sess;
}

router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'image required' });
    const pk = await imageUnlock(req.file.buffer);
    const wallet = new Wallet(pk);
    const sessionId = randomUUID();
    sessions.set(sessionId, { address: wallet.address, signer: wallet, createdAt: Date.now() });
    res.json({ sessionId, address: wallet.address });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/sign', async (req, res) => {
  try {
    const { sessionId, payload } = req.body || {};
    const sess = getSession(sessionId);
    if (!sess) return res.status(400).json({ error: 'invalid session' });
    let signature;
    if (payload?.type === 'eip191') {
      signature = await sess.signer.signMessage(payload.data);
    } else if (payload?.type === 'eip712') {
      const { domain, types, message } = payload.data || {};
      signature = await sess.signer.signTypedData(domain, types, message);
    } else if (payload?.type === 'tx') {
      signature = await sess.signer.signTransaction(payload.data);
    } else {
      return res.status(400).json({ error: 'unsupported payload' });
    }
    res.json({ signature });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sendRaw', (req, res) => {
  res.status(501).json({ error: 'sendRaw not implemented' });
});

module.exports = router;
