const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());

function reqLog(req, res, next) {
  const t0 = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - t0;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms`);
  });
  next();
}
app.use(reqLog);

const PORT = process.env.PORT || 8787;

app.get('/health', (_, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use('/api/0x', require('./routes/zeroex'));
app.use('/api/relay', require('./routes/relay'));
app.use('/api/apeswap', require('./routes/apeswap'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/dex', require('./routes/dex'));
const pluginsRouter = require('./routes/plugins');
// Plugin routes are mounted under /api/plugins
app.use('/api/plugins', pluginsRouter);

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
