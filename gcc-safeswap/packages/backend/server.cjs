require('dotenv').config();
const { env, summarize } = require('./config/env');
const express = require('express');
let helmetMiddleware = () => (req,res,next)=>next();
try { helmetMiddleware = require('helmet'); } catch {}
const rateLimit = require('express-rate-limit');
const { originGuard } = require('./middleware/originGuard');
const { refreshRegistry } = require('./mev/registry');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(helmetMiddleware());
app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true }));
app.use(originGuard);
app.use((_,res,next)=>{ res.setHeader('x-robots-tag','noindex'); next(); });

console.log('[env] loaded:', summarize());

// Basic sanity checks
['PUBLIC_RPC','TOKEN_GCC','TOKEN_WBNB','PANCAKE_ROUTER'].forEach(k=>{
  if (!env[k]) {
    console.error(`[env] Missing required: ${k}`);
    process.exit(1);
  }
});

refreshRegistry();
setInterval(refreshRegistry, 5 * 60 * 1000);

function reqLog(req, res, next) {
  const t0 = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t0;
    const body = req.body && Object.keys(req.body).length ? JSON.stringify(req.body).slice(0,200) : '';
    const bodyPart = body ? ` body=${body}` : '';
    console.log(`${req.method} ${req.path} -> ${res.statusCode} ${ms}ms${bodyPart}`);
  });
  next();
}
app.use(reqLog);

// tiny guard middleware
app.use('/api', (req,res,next)=>{
  const q = { ...req.query, ...req.body };
  if (q.sellAmount && !/^\d+$/.test(String(q.sellAmount))) {
    return res.status(400).json({ error: 'invalid sellAmount' });
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// mount routes (0x, dex, plugins, etc.)
require('./routes')(app, env);

app.listen(env.PORT, () => {
  console.log(`Server running on ${env.PORT}`);
});
