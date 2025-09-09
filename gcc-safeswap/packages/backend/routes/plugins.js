// CJS plugin loader + health
const express = require('express');
const path = require('path');
const config = require('../plugins.config.cjs');

const router = express.Router();

// Track mounted plugins so the frontend can discover them
const mounted = [];

// Load each plugin listed in config.enabled
(config.enabled || []).forEach((pluginName) => {
  try {
    const pluginPath = path.join(__dirname, '..', 'plugins', pluginName);
    // Each plugin must export an express.Router instance
    const pluginRouter = require(pluginPath);
    router.use(`/${pluginName}`, pluginRouter);
    mounted.push({ name: pluginName });
    console.log(`[plugins] Mounted ${pluginName}`);
  } catch (err) {
    console.error(`[plugins] Failed to load ${pluginName}:`, err.message);
  }
});

// Health endpoint used by the frontend to know which plugins are active
router.get('/_health', (_req, res) => {
  res.json({ ok: true, plugins: mounted });
});

module.exports = router;

