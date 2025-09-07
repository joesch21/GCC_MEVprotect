const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { Wallet } = require('ethers');
const rateLimit = require('express-rate-limit');

let decodeRust;
try {
  decodeRust = require('condor_wallet').decode_wallet_from_image;
} catch (err) {
  decodeRust = null;
}

const router = express.Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

const store = new Map();
const TTL = 5 * 60 * 1000; // 5 minutes
const MARKER = Buffer.from('CONDORWALLET');
const sessions = new Map();
const SESS_TTL = 10 * 60 * 1000; // 10 minutes

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

function sessionCleanup() {
  const now = Date.now();
  for (const [id, { exp }] of sessions) {
    if (exp < now) sessions.delete(id);
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

router.post('/unlock', upload.single('image'), (req, res) => {
  try {
    const pass = req.body?.passphrase;
    if (!pass || pass.length < 8 || !req.file) {
      return res.status(400).json({ error: 'invalid input' });
    }

    let address, fingerprint, privateKey;

    if (decodeRust) {
      const out = decodeRust(req.file.buffer, pass);
      address = out.address;
      fingerprint = out.fingerprint;
      privateKey = out.private_key || out.privateKey;
    } else {
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
      const key = crypto.pbkdf2Sync(pass, salt, 200000, 32, 'sha256');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(tag);
      const pkBuf = Buffer.concat([decipher.update(ct), decipher.final()]);
      privateKey = '0x' + pkBuf.toString('hex');
      const wallet = new Wallet(privateKey);
      address = wallet.address;
      fingerprint = crypto.createHash('sha256').update(pkBuf).digest().slice(0, 4).toString('hex');
    }

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { pkHex: privateKey, address, exp: Date.now() + SESS_TTL });
    res.json({ sessionId, address, fingerprint });
  } catch (err) {
    res.status(422).json({ error: err.message });
  } finally {
    sessionCleanup();
  }
});

router.post('/signTransaction', express.json(), async (req, res) => {
  try {
    const { sessionId, tx } = req.body || {};
    sessionCleanup();
    const sess = sessions.get(sessionId);
    if (!sess) return res.status(404).json({ error: 'session expired' });
    const signer = new Wallet(sess.pkHex);
    if (tx.chainId == null) tx.chainId = 56;
    const rawTx = await signer.signTransaction(tx);
    res.json({ rawTx });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

router.post('/signTypedData', express.json(), async (req, res) => {
  try {
    const { sessionId, domain, types, message } = req.body || {};
    sessionCleanup();
    const sess = sessions.get(sessionId);
    if (!sess) return res.status(404).json({ error: 'session expired' });
    const signer = new Wallet(sess.pkHex);
    const signature = await signer.signTypedData(domain, types, message);
    res.json({ signature });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

router.post('/destroy', express.json(), (req, res) => {
  const { sessionId } = req.body || {};
  sessions.delete(sessionId);
  sessionCleanup();
  res.json({ ok: true });
});

module.exports = router;
