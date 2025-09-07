const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { Wallet } = require('ethers');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

const store = new Map();
const TTL = 5 * 60 * 1000; // 5 minutes
const MARKER = Buffer.from('CONDORWALLET');

function cleanup() {
  const now = Date.now();
  for (const [h, { expiry }] of store) {
    if (expiry < now) store.delete(h);
  }
  while (store.size > 256) {
    const first = store.keys().next().value;
    store.delete(first);
  }
}

router.use(rateLimit({ windowMs: 60 * 1000, max: 20 }));

router.post('/generate', (req, res) => {
  cleanup();
  const wallet = Wallet.createRandom();
  const handle = crypto.randomBytes(8).toString('hex');
  const pkBuf = Buffer.from(wallet.privateKey.slice(2), 'hex');
  const hash = crypto.createHash('sha256').update(pkBuf).digest();
  const fingerprint = hash.slice(0, 4).toString('hex');
  store.set(handle, { key: wallet.privateKey, expiry: Date.now() + TTL });
  res.json({ handle, address: wallet.address, fingerprint });
});

router.post('/embed', upload.single('image'), (req, res) => {
  try {
    const { handle, passphrase } = req.body;
    if (!handle || !passphrase || passphrase.length < 8 || !req.file) {
      return res.status(400).json({ error: 'invalid input' });
    }
    cleanup();
    const entry = store.get(handle);
    if (!entry) {
      return res.status(400).json({ error: 'invalid handle' });
    }
    store.delete(handle);
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(passphrase, salt, 200000, 32, 'sha256');
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    const pkBuf = Buffer.from(entry.key.slice(2), 'hex');
    const ct = Buffer.concat([cipher.update(pkBuf), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = JSON.stringify({
      salt: salt.toString('base64'),
      nonce: nonce.toString('base64'),
      tag: tag.toString('base64'),
      ct: ct.toString('base64')
    });
    const out = Buffer.concat([req.file.buffer, MARKER, Buffer.from(payload)]);
    res.set('Content-Type', 'image/png');
    res.send(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/decode', upload.single('image'), (req, res) => {
  try {
    const { passphrase } = req.body;
    if (!passphrase || passphrase.length < 8 || !req.file) {
      return res.status(400).json({ error: 'invalid input' });
    }
    const buf = req.file.buffer;
    const idx = buf.lastIndexOf(MARKER);
    if (idx === -1) {
      return res.status(400).json({ error: 'no payload' });
    }
    const payloadStr = buf.slice(idx + MARKER.length).toString();
    const payload = JSON.parse(payloadStr);
    const salt = Buffer.from(payload.salt, 'base64');
    const nonce = Buffer.from(payload.nonce, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const ct = Buffer.from(payload.ct, 'base64');
    const key = crypto.pbkdf2Sync(passphrase, salt, 200000, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    const pkBuf = Buffer.concat([decipher.update(ct), decipher.final()]);
    const privateKey = '0x' + pkBuf.toString('hex');
    const wallet = new Wallet(privateKey);
    const fingerprint = crypto.createHash('sha256').update(pkBuf).digest().slice(0, 4).toString('hex');
    res.json({ address: wallet.address, fingerprint });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
