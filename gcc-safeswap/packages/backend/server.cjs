// server.cjs
const express = require("express");
const morgan  = require("morgan");
const cors    = require("cors");
const fetch   = require("node-fetch");
const { ethers } = require("ethers");

const app  = express();
const PORT = process.env.PORT || 3000;

// ---------- Constants ----------
const GCC  = "0x092ac429b9c3450c9909433eb0662c3b7c13cf9a";
const WBNB = "0xbb4Cdb9CBd36B01bD1cBaEBF2De08d9173bc095c";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const BTCB = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c";
const SOL  = "0x22ADBeC2ce1022060b2abe12A168B5AC0416dd6B"; // bridged SOL on BNB

const PCS_V2_ROUTER  = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PCS_V2_FACTORY = "0xCA143Ce32Fe78f1f7019d7d551a6402fC5350c73";

const ERC20_ABI   = ["function decimals() view returns (uint8)","function symbol() view returns (string)"];
const PCS_V2_ABI  = ["function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory)"];
const FACTORY_ABI = ["function getPair(address,address) view returns (address)"];
const PAIR_ABI    = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112,uint112,uint32)"
];

const DEFAULT_SLIPPAGE_BPS = 300; // 3.00%
const REFLECTION_PAD_BPS   = 200; // 2.00% min-received buffer

// ---------- App ----------
app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));

console.log("🛠️ SAFE-BOOT", JSON.stringify({
  NODE: process.version,
  HAS_BSC_RPC: !!process.env.BSC_RPC,
  PORT_BOUND: PORT
}));

// Health (aliases)
app.get(["/api/plugins/health", "/plugins/health", "/health"], (_req, res) =>
  res.json({ status: "ok", ts: Date.now() })
);

// ---------- Helpers ----------
const _decimalsCache = new Map();
async function getDecimals(provider, addr) {
  if (_decimalsCache.has(addr)) return _decimalsCache.get(addr);
  const t = new ethers.Contract(addr, ERC20_ABI, provider);
  const d = await t.decimals();
  _decimalsCache.set(addr, d);
  return d;
}

async function toRawAmount(provider, tokenAddr, amountStr) {
  try {
    if (!/[.]/.test(String(amountStr)) && BigInt(amountStr) > 1_000_000_000_000n) return String(amountStr);
  } catch {}
  const dec = await getDecimals(provider, tokenAddr);
  const raw = ethers.utils.parseUnits(String(amountStr), dec);
  return raw.toString();
}

function normalize(token) {
  const s = String(token || "").trim();
  if (!s) return null;
  if (s.toUpperCase() === "GCC") return GCC;
  if (s.toUpperCase() === "BNB") return WBNB; // use WBNB for quoting
  return s; // assume address
}

// ---------- 0x (primary) ----------
async function quoteVia0x({ sell, buy, amountRaw, slippageBps }) {
  const url = new URL("https://bsc.api.0x.org/swap/v1/quote");
  url.searchParams.set("sellToken", sell);
  url.searchParams.set("buyToken",  buy);
  url.searchParams.set("sellAmount", amountRaw);
  url.searchParams.set("slippagePercentage", (slippageBps || DEFAULT_SLIPPAGE_BPS) / 10000);
  const r = await fetch(url.toString(), { timeout: 12000 });
  if (!r.ok) throw new Error(`0x ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return { source: "0x", sellAmount: data.sellAmount, buyAmount: data.buyAmount };
}

// ---------- PancakeSwap v2 (fallback) ----------
async function quoteViaPCSv2({ sell, buy, amount }) {
  const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC);
  const router   = new ethers.Contract(PCS_V2_ROUTER, PCS_V2_ABI, provider);

  const amountRaw = await toRawAmount(provider, sell, String(amount));

  const candidates = [
    [sell, buy],           // direct
    [sell, WBNB, buy],
    [sell, USDT, buy],
    [sell, BTCB, buy],
    [sell, SOL,  buy],
    [sell, SOL,  WBNB],
    [sell, USDT, WBNB],
    [sell, BTCB, WBNB]
  ];

  for (const path of candidates) {
    try {
      const out = await router.getAmountsOut(ethers.BigNumber.from(amountRaw), path);
      const outAmt = out[out.length - 1].toString();
      if (outAmt !== "0") {
        return { source: "pcs_v2", sellAmount: amountRaw, buyAmount: outAmt, path };
      }
    } catch { /* try next */ }
  }

  throw new Error("PCS v2: no route across candidate paths or amount too small");
}

// ---------- Unified Quote ----------
async function handleQuote(req, res) {
  try {
    const { fromToken, toToken, amount, slippageBps } = req.body || {};
    const sell = normalize(fromToken);
    const buy  = normalize(toToken);
    if (!sell || !buy || !amount) {
      return res.status(400).json({ error: "fromToken, toToken, amount are required" });
    }

    // Try 0x first
    let q;
    try {
      const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC);
      const amountRaw = await toRawAmount(provider, sell, String(amount));
      q = await quoteVia0x({ sell, buy, amountRaw, slippageBps });
    } catch (e0) {
      // Fallback to PCS v2
      try {
        q = await quoteViaPCSv2({ sell, buy, amount: String(amount) });
      } catch (ePcs) {
        return res.status(502).json({ error: "no_route", details: { ox: String(e0?.message||""), pcs: String(ePcs?.message||"") } });
      }
    }

    // Reflection / min-received padding
    const buyStr = String(q.buyAmount);
    let minStr;
    try {
      const bi = BigInt(buyStr);
      minStr = ((bi * BigInt(10000 - REFLECTION_PAD_BPS)) / 10000n).toString();
    } catch {
      minStr = String(Math.floor(Number(buyStr) * (1 - REFLECTION_PAD_BPS / 10000)));
    }

    res.json({
      source: q.source,
      sellToken: sell,
      buyToken: buy,
      sellAmount: String(q.sellAmount),
      buyAmount: buyStr,
      minBuyAmount: minStr,
      slippageBps: Number(slippageBps || DEFAULT_SLIPPAGE_BPS),
      at: Date.now()
    });
  } catch (err) {
    return res.status(502).json({ error: "internal", details: String(err.message || err) });
  }
}

app.post("/api/quote", handleQuote);
app.post("/quote", handleQuote); // alias

// ---------- Debug (browser click) ----------
app.get("/api/debug/token", async (req, res) => {
  try {
    const addr = String(req.query.addr||"").trim();
    const p = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC);
    const t = new ethers.Contract(addr, ERC20_ABI, p);
    const [dec, sym] = await Promise.all([t.decimals(), t.symbol()]);
    res.json({ address: addr, decimals: Number(dec), symbol: sym });
  } catch (e) {
    res.status(500).json({ error:"token_debug_failed", details:String(e.message||e) });
  }
});

app.get("/api/debug/pair", async (req, res) => {
  try {
    const a = String(req.query.a||"").trim();
    const b = String(req.query.b||"").trim();
    const p = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC);
    const f = new ethers.Contract(PCS_V2_FACTORY, FACTORY_ABI, p);
    const pair = await f.getPair(a, b);
    if (pair === ethers.constants.AddressZero) return res.json({ exists:false, pair });
    const c = new ethers.Contract(pair, PAIR_ABI, p);
    const [token0, token1] = await Promise.all([c.token0(), c.token1()]);
    const [r0,r1] = await c.getReserves();
    res.json({ exists:true, pair, token0, token1, reserves:{ reserve0:r0.toString(), reserve1:r1.toString() }});
  } catch (e) {
    res.status(500).json({ error:"pair_debug_failed", details:String(e.message||e) });
  }
});

app.get("/api/debug/quote-gcc-wbnb", async (_req, res) => {
  try {
    const p = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC);
    const r = new ethers.Contract(PCS_V2_ROUTER, PCS_V2_ABI, p);
    const amountIn = ethers.utils.parseUnits("1", 18); // 1 GCC
    const out = await r.getAmountsOut(amountIn, [GCC, WBNB]);
    res.json({ source:"direct_pcs_v2", sellAmount: amountIn.toString(), buyAmount: out[1].toString(), path:[GCC,WBNB] });
  } catch (e) {
    res.status(502).json({ error:"direct_quote_failed", details:String(e.message||e) });
  }
});

// ---------- Start ----------
process.on("uncaughtException", e => console.error("❌ Uncaught", e));
process.on("unhandledRejection", e => console.error("❌ UnhandledRejection", e));
app.listen(PORT, () => console.log(`✅ SafeSwap backend on :${PORT}`));
