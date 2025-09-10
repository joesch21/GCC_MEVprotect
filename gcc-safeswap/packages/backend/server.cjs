const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const fetch = require("node-fetch");
const { ethers } = require("ethers");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Tokens / routers ----
const GCC_BEP20 = "0x092ac429b9c3450c9909433eb0662c3b7c13cf9a";
const BNB_NATIVE = "BNB";
const WBNB      = "0xbb4Cdb9CBd36B01bD1cBaEBF2De08d9173bc095c";
const USDT      = "0x55d398326f99059fF775485246999027B3197955";

const PCS_V2_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PCS_V2_ABI = [
  "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)"
];

const DEFAULT_SLIPPAGE_BPS = 300; // 3%
const REFLECTION_PAD_BPS   = 200; // ~2% extra min-received pad

console.log("🛠️ SAFE-BOOT",
  JSON.stringify({
    NODE: process.version,
    HAS_BSC_RPC: Boolean(process.env.BSC_RPC),
    PORT: process.env.PORT
  })
);

app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));

// ---- Health (aliases) ----
app.get(["/api/plugins/health", "/plugins/health", "/health"], (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

app.post("/api/_debug/echo", (req, res) => {
  res.json({
    ok: true,
    headers: req.headers,
    body: req.body,
    hasBscRpc: Boolean(process.env.BSC_RPC)
  });
});

// ---- helpers ----
function normalizeToken(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  if (s.toUpperCase() === "GCC") return GCC_BEP20;
  if (s.toUpperCase() === "BNB" || s === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") return BNB_NATIVE;
  return s;
}
function toPCSAddr(token) { return token.toUpperCase() === "BNB" ? WBNB : token; }

// ---- 0x primary ----
async function quoteVia0x({ fromToken, toToken, amount, slippageBps }) {
  const url = new URL("https://bsc.api.0x.org/swap/v1/quote");
  url.searchParams.set("sellToken", fromToken);
  url.searchParams.set("buyToken",  toToken);
  url.searchParams.set("sellAmount", amount);
  url.searchParams.set("slippagePercentage", (slippageBps || DEFAULT_SLIPPAGE_BPS) / 10000);
  const r = await fetch(url.toString(), { timeout: 12000 });
  if (!r.ok) throw new Error(`0x ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return { source: "0x", ...data };
}

// ---- PancakeSwap v2 fallback ----
async function quoteViaPCS({ fromToken, toToken, amount }) {
  const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC);
  const router   = new ethers.Contract(PCS_V2_ROUTER, PCS_V2_ABI, provider);

  const sell = toPCSAddr(fromToken);
  const buy  = toPCSAddr(toToken);

  const paths = [
    [sell, buy],
    [sell, USDT, buy]
  ];

  for (const path of paths) {
    try {
      const out = await router.getAmountsOut(ethers.BigNumber.from(amount), path);
      const buyAmount = out[out.length - 1].toString();
      return { source: "pcs_v2", sellAmount: String(amount), buyAmount, path };
    } catch {}
  }
  throw new Error("PCS no route");
}

// ---- unified quote (aliases for path robustness) ----
async function handleQuote(req, res) {
  try {
    const { fromToken, toToken, amount, slippageBps } = req.body || {};
    const sellToken = normalizeToken(fromToken);
    const buyToken  = normalizeToken(toToken);
    if (!sellToken || !buyToken || !amount) {
      return res.status(400).json({ error: "fromToken, toToken, amount are required" });
    }

    let q;
    try {
      q = await quoteVia0x({
        fromToken: sellToken, toToken: buyToken,
        amount: String(amount),
        slippageBps: Number(slippageBps || DEFAULT_SLIPPAGE_BPS)
      });
    } catch (e0) {
      console.error("0x quote failed:", e0.message);
      try {
        q = await quoteViaPCS({ fromToken: sellToken, toToken: buyToken, amount: String(amount) });
      } catch (ePcs) {
        console.error("PCS quote failed:", ePcs.message);
        return res.status(502).json({
          error: "no_route",
          details: {
            ox: e0 && String(e0.message || e0),
            pcs: ePcs && String(ePcs.message || ePcs)
          }
        });
      }
    }

    // reflection pad on min received (integer math)
    const buyAmountStr = String(q.buyAmount);
    let minBuyAmountStr;
    try {
      const bi = BigInt(buyAmountStr);
      minBuyAmountStr = ((bi * BigInt(10000 - REFLECTION_PAD_BPS)) / 10000n).toString();
    } catch {
      minBuyAmountStr = String(Math.floor(Number(buyAmountStr) * (1 - REFLECTION_PAD_BPS/10000)));
    }

    res.json({
      source: q.source,
      sellToken, buyToken,
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
}

app.post("/api/quote/pcs", async (req, res) => {
  try {
    const { fromToken, toToken, amount } = req.body || {};
    const sellToken = normalizeToken(fromToken);
    const buyToken  = normalizeToken(toToken);

    if (!sellToken || !buyToken || !amount) {
      return res.status(400).json({ error: "fromToken, toToken, amount required" });
    }
    if (!process.env.BSC_RPC) {
      return res.status(503).json({ error: "BSC_RPC missing" });
    }

    console.log("🔎 PCS TEST", { sellToken, buyToken, amount });
    const q = await quoteViaPCS({ fromToken: sellToken, toToken: buyToken, amount: String(amount) });
    return res.json(q);
  } catch (err) {
    console.error("PCS_TEST_ERR:", err);
    return res.status(502).json({ error: "pcs_test_failed", details: String(err.message || err) });
  }
});

app.post("/api/quote", handleQuote);
app.post("/quote", handleQuote);

// ---- crash guards ----
process.on("uncaughtException", e => console.error("❌ Uncaught", e));
process.on("unhandledRejection", e => console.error("❌ UnhandledRejection", e));

app.listen(PORT, () => console.log(`✅ SafeSwap backend running on :${PORT}`));
