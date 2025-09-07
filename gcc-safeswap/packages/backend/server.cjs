const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());

const PORT = process.env.PORT || 8787;

app.get('/health', (_, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use('/api/0x', require('./routes/zeroex'));
app.use('/api/relay', require('./routes/relay'));
app.use('/api/apeswap', require('./routes/apeswap'));
app.use('/api/wallet', require('./routes/wallet'));

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
