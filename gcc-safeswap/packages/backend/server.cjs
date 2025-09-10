require('dotenv').config();
const { env, summarize } = require('./config/env');
const express = require('express');
const cors = require('cors');
let helmetMiddleware = () => (req,res,next)=>next();
try { helmetMiddleware = require('helmet'); } catch {}
const rateLimit = require('express-rate-limit');
const { refreshRegistry } = require('./mev/registry');

const app = express();

// Allow production + preview Vercel + local dev
const ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
console.log('[env] ALLOWED_ORIGINS:', ORIGINS);

// Regex for Vercel preview branches of THIS project
const vercelPreviewRe = /^https:\/\/gcc-me-vprotect(-git-[a-z0-9-]+)?\.vercel\.app$/i;

// Decide per-request
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);

    if (
      ORIGINS.includes(origin) ||
      vercelPreviewRe.test(origin) ||
      origin === 'http://localhost:5173'
    ) return cb(null, true);

    cb(new Error('CORS: origin not allowed'));
  },
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-api-key',
    'x-requested-with'
  ],
  maxAge: 86400
};

// Must be the FIRST middleware
app.use(cors(corsOptions));

// Handle explicit preflight quickly
app.options('*', cors(corsOptions));

// keep caches honest
app.use((req, res, next) => { res.setHeader('Vary', 'Origin'); next(); });

// body parsers
app.use(express.json({ limit: '1mb' }));

// security & rate limit
app.use(helmetMiddleware());
app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true }));

// misc headers
app.use((_,res,next)=>{ res.setHeader('x-robots-tag','noindex'); next(); });

console.log('[env] loaded:', summarize());

// Basic sanity checks
['PUBLIC_RPC','GCC_ADDRESS','WBNB_ADDRESS','PANCAKE_ROUTER'].forEach(k=>{
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

// mount routes
app.use('/api/dex', require('./routes/dex'));
require('./routes')(app, env);

// error handler
app.use((err, req, res, next) => {
  if (err?.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(env.PORT, () => {
  console.log(`Server running on ${env.PORT}`);
});
