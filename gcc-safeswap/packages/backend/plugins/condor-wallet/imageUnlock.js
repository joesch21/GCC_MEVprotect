const crypto = require('crypto');

async function decodeImageToKey(buf) {
  // Placeholder: derive key from image hash
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  return '0x' + hash.slice(0, 64);
}

module.exports = async function imageUnlock(buf) {
  if (process.env.ENABLE_EXPERIMENTAL_CONDOR_WALLET !== '1') {
    const err = new Error('Condor Wallet disabled');
    err.status = 501;
    throw err;
  }
  return decodeImageToKey(buf);
};
