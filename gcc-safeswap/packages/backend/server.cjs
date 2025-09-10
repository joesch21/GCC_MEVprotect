// server.cjs
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const fetch = require("node-fetch");
const { ethers } = require("ethers");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- CONFIG ----------
const GCC_BEP20 = "0x092ac429b9c3450c9909433eb0662c3b7c13cf9a";
const BNB_NATIVE = "BNB"; // 0x accepts "BNB" as native token on BSC
const DEFAULT_SLIPPAGE_BPS = 300; // 3.00%
const REFLECTION_PAD = 0.98; // 2% buffer on top of aggregator output
const CHAIN_NAME = "bsc";
// ----------------------------

// === PancakeSwap v2 constants ===
const PCS_V2_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const WBNB = "0xbb4Cdb9CBd36B01bD1cBaEBF2De08d9173bc095c";
const USDT = "0x55d398326f99059fF775485246999027B3197955";

const PCS_V2_ABI = [
  "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)"
];

function toPCSAddress(token) {
  if (token.toUpperCase() === "BNB") return WBNB;
  return token;
}

async function quoteViaPCS({ fromToken, toToken, amount }) {
  const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC);
  const router = new ethers.Contract(PCS_V2_ROUTER, PCS_V2_ABI, provider);

  const sell = toPCSAddress(fromToken);
  const buy = toPCSAddress(toToken);

  const paths = [
    [sell, buy],
    [sell, USDT, buy]
  ];

  for (const path of paths) {
    try {
      const out = await router.getAmountsOut(ethers.BigNumber.from(amount), path);
      const buyAmount = out[out.length - 1].toString();
      return {
        source: "pcs_v2",
        sellAmount: String(amount),
        buyAmount
      };
    } catch (_) {
      // try next path
    }
  }

  throw new Error("PCS no route for provided amount/path candidates");
}

app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));

// Health for FE + Render checks
app.get(["/api/plugins/health", "/plugins/health", "/health"], (_req, res) => {
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


async function handleQuote(req, res) {
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
      try {
        q = await quoteViaPCS({
          fromToken: sellToken,
          toToken: buyToken,
          amount: String(amount)
        });
      } catch (ePcs) {
        console.error("PCS quote failed:", ePcs.message);
        return res.status(502).json({
          error: "No route from aggregators",
          details: e0.message || ePcs.message
        });
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
}

app.post("/api/quote", handleQuote);
app.post("/quote", handleQuote);
app.get("/api/quote", (_req, res) => res.status(405).send("Use POST /api/quote"));
app.get("/quote", (_req, res) => res.status(405).send("Use POST /api/quote"));

// Crash guards
process.on("uncaughtException", (e) => console.error("❌ Uncaught", e));
process.on("unhandledRejection", (e) => console.error("❌ UnhandledRejection", e));

app.listen(PORT, () => {
  console.log(`✅ SafeSwap backend running on :${PORT}`);
});

