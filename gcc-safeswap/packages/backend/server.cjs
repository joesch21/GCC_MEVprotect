// server.cjs
const express = require("express");
const morgan = require("morgan");

const app = express();

// *** CRITICAL: Respect Render-assigned port ***
const PORT = process.env.PORT || 3000; // local fallback only

app.use(express.json());
app.use(morgan("tiny"));

// --- Health (stops 404 spam in console) ---
app.get("/api/plugins/health", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

// --- Price stub (replace with real aggregator later) ---
// GET /api/price/:symbol  (e.g., /api/price/gcc)
app.get("/api/price/:symbol", async (req, res) => {
  const symbol = String(req.params.symbol || "").toUpperCase();

  try {
    // TODO: swap in 0x/1inch/private RPC quote here.
    // Temporary safe stub to keep UI alive:
    // If GCC, return a placeholder so UI math renders.
    const prices = {
      GCC: 0.08, // USD or BNB-equivalent depending on your UI expectation
      BNB: 1,
    };
    const price = prices[symbol] ?? null;

    if (!price) {
      return res.status(404).json({ error: `Unknown symbol: ${symbol}` });
    }
    res.json({ symbol, price, source: "stub", at: Date.now() });
  } catch (err) {
    console.error("Price route error:", err);
    res.status(502).json({ error: "Quote backend failure" });
  }
});

// --- Global crash guards ---
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
});

app.listen(PORT, () => {
  console.log(`✅ SafeSwap backend running on :${PORT}`);
});

