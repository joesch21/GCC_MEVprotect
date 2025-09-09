const express = require('express');
const path = require('path');
const config = require('../plugins.config.cjs');

const router = express.Router();

(const load = () => {
  const enabled = config.enabled || [];
  for (const name of enabled) {
    if (name === 'condor-wallet' && process.env.ENABLE_EXPERIMENTAL_CONDOR_WALLET !== '1') {
      continue;
    }
    try {
      const mod = require(path.join('..', 'plugins', name));
      router.use('/' + name, mod.default || mod);
      console.log(`Loaded plugin: ${name}`);
    } catch (err) {
      console.error(`Failed to load plugin ${name}:`, err.message);
    }
  }
})();

module.exports = router;
