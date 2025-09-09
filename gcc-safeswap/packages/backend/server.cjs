const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();
app.use(cors({
  origin: [
    'http://localhost:5173',
    process.env.FRONTEND_ORIGIN // optional
  ].filter(Boolean),
  methods: ['GET','POST'],
}));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true }));

function reqLog(req, res, next) {
  const t0 = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - t0;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms`);
  });
  next();
}
app.use(reqLog);

// tiny guard middleware
app.use('/api', (req,res,next)=>{
  const q = { ...req.query, ...req.body };
  if (q.sellAmount && !/^\d+$/.test(String(q.sellAmount))) {
    return res.status(400).json({ error: "invalid sellAmount" });
  }
  next();
});

const PORT = process.env.PORT || 8787;

app.get('/health', (_, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const zeroex = require('./routes/zeroex');
const relay = require('./routes/relay');
const apeswap = require('./routes/apeswap');
const wallet = require('./routes/wallet');
const dex = require('./routes/dex.js');
const swap = require('./routes/swap.js');
const pluginsRouter = require('./routes/plugins');

app.use('/api/0x', zeroex);
app.use('/api/relay', relay);
app.use('/api/apeswap', apeswap);
app.use('/api/wallet', wallet);
app.use('/api/dex', dex);
app.use('/api/swap', swap);
// Plugin routes are mounted under /api/plugins
app.use('/api/plugins', pluginsRouter);

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
