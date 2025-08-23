const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8787;

app.get('/health', (_, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use('/api/0x', require('./routes/zeroex'));
app.use('/api/relay', require('./routes/relay'));
app.use('/api/fusion', require('./routes/fusion'));

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
