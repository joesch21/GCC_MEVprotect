// server.cjs
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- CONFIG ----------
const GCC_BEP20 = "0x092ac429b9c3450c9909433eb0662c3b7c13cf9a";
const BNB_NATIVE = "BNB"; // 0x accepts "BNB" as native token on BSC
const DEFAULT_SLIPPAGE_BPS = 300; // 3.00%
const REFLECTION_PAD = 0.98; // 2% buffer on top of aggregator output
const CHAIN_NAME = "bsc";
const CHAIN_ID = 56; // for 1inch URL
// ----------------------------

app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));

// Health for FE + Render checks
app.get("/api/plugins/health", (_req, res) => {
  res.json({ status: "ok", chain: CHAIN_NAME, ts: Date.now() });
});

// Normalize a token id coming from FE: allow "GCC", "BNB", or a 0x-address
function normalizeToken(input) {
  if (!input) return null;
  const s = String(input).trim();

  // GCC shortcut
  if (s.toUpperCase() === "GCC") return GCC_BEP20;

  // Native token shortcut(s)
  if (s.toUpperCase() === "BNB" || s === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE")
    return BNB_NATIVE;

  // Otherwise expect a checksummed/hex address
  return s;
}

// 0x quote (primary)
async function quoteVia0x({ fromToken, toToken, amount, slippageBps }) {
  const url = new URL("https://bsc.api.0x.org/swap/v1/quote");
  url.searchParams.set("sellToken", fromToken);
  url.searchParams.set("buyToken", toToken);
  url.searchParams.set("sellAmount", amount);
  url.searchParams.set("slippagePercentage", (slippageBps || DEFAULT_SLIPPAGE_BPS) / 10000);

  const r = await fetch(url.toString(), { timeout: 12_000 });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`0x ${r.status}: ${err}`);
  }
  const data = await r.json();
  return { source: "0x", ...data };
}

// Optional 1inch fallback (enable only if ONEINCH_API_KEY is set)
async function quoteVia1inch({ fromToken, toToken, amount, slippageBps }) {
  if (!process.env.ONEINCH_API_KEY) {
    throw new Error("1inch disabled (missing ONEINCH_API_KEY)");
  }
  const url = new URL(`https://api.1inch.dev/swap/v6.0/${CHAIN_ID}/quote`);
  url.searchParams.set("src", fromToken);
  url.searchParams.set("dst", toToken);
  url.searchParams.set("amount", amount);
  // 1inch expects percent, not bps. 300 bps => 3.0
  url.searchParams.set("slippage", (slippageBps || DEFAULT_SLIPPAGE_BPS) / 100);

  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.ONEINCH_API_KEY}` },
    timeout: 12_000,
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`1inch ${r.status}: ${err}`);
  }
  const data = await r.json();
  // Align key names roughly to 0x shape for FE simplicity
  return {
    source: "1inch",
    buyAmount: data.dstAmount, // 1inch returns srcAmount/dstAmount (strings)
    sellAmount: data.srcAmount,
    // gas / route fields differ; FE should not depend on them tightly.
    ...data
  };
}

// Unified quote endpoint
app.post("/api/quote", async (req, res) => {
  try {
    const { fromToken, toToken, amount, slippageBps } = req.body || {};

    const sellToken = normalizeToken(fromToken);
    const buyToken = normalizeToken(toToken);
    if (!sellToken || !buyToken || !amount) {
      return res.status(400).json({ error: "fromToken, toToken, amount are required" });
    }

    // 0x first
    let q;
    try {
      q = await quoteVia0x({
        fromToken: sellToken,
        toToken: buyToken,
        amount: String(amount),
        slippageBps: Number(slippageBps || DEFAULT_SLIPPAGE_BPS)
      });
    } catch (e0) {
      console.error("0x quote failed:", e0.message);
      // Try 1inch fallback ONLY if key present
      try {
        q = await quoteVia1inch({
          fromToken: sellToken,
          toToken: buyToken,
          amount: String(amount),
          slippageBps: Number(slippageBps || DEFAULT_SLIPPAGE_BPS)
        });
      } catch (e1) {
        console.error("1inch fallback failed:", e1.message);
        return res.status(502).json({ error: "No route from aggregators", details: e0.message });
      }
    }

    // Reflection pad on min received
    // Both 0x and 1inch return amounts as strings in base units.
    const buyAmountStr = String(q.buyAmount);
    // Avoid BigInt → Number overflow: use BigInt math and round down.
    let minBuyAmountStr;
    try {
      const buyAmountBI = BigInt(buyAmountStr);
      // Multiply by 98 and divide by 100 for ~2% pad (integer math).
      minBuyAmountStr = ((buyAmountBI * 98n) / 100n).toString();
    } catch {
      // Fallback to float if aggregator returns scientific notation (unlikely)
      const padded = Math.floor(Number(buyAmountStr) * REFLECTION_PAD);
      minBuyAmountStr = String(padded);
    }

    res.json({
      source: q.source,
      sellToken,
      buyToken,
      sellAmount: String(q.sellAmount || amount),
      buyAmount: buyAmountStr,
      minBuyAmount: minBuyAmountStr,
      slippageBps: Number(slippageBps || DEFAULT_SLIPPAGE_BPS),
      at: Date.now()
    });
  } catch (err) {
    console.error("Quote endpoint error:", err);
    res.status(502).json({ error: "Quote backend failure", details: err.message });
  }
});

// Crash guards
process.on("uncaughtException", (e) => console.error("❌ Uncaught", e));
process.on("unhandledRejection", (e) => console.error("❌ UnhandledRejection", e));

app.listen(PORT, () => {
  console.log(`✅ SafeSwap backend running on :${PORT}`);
});

