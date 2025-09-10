// server.cjs
const express = require("express");
const morgan  = require("morgan");
const cors    = require("cors");
const fetch   = require("node-fetch");
const { ethers } = require("ethers");

const app  = express();
const PORT = process.env.PORT || 3000;

// ---------- Logging ----------
function t() { return new Date().toISOString(); }
function logInfo(msg, obj)  { console.log(`[${t()}] ${msg}`, obj ?? ""); }
function logWarn(msg, obj)  { console.warn(`[${t()}] ${msg}`, obj ?? ""); }
function logErr (msg, obj)  { console.error(`[${t()}] ${msg}`, obj ?? ""); }

// ---------- Constants ----------
// ==== canonical lowercase addresses (BNB Chain) ====
const GCC  = "0x092ac429b9c3450c9909433eb0662c3b7c13cf9a";
const WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const BTCB = "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c";
const SOL  = "0x22adbec2ce1022060b2abe12a168b5ac0416dd6b"; // bridged SOL on BNB

const PCS_V2_ROUTER  = "0x10ed43c718714eb63d5aa57b78b54704e256024e";
const PCS_V2_FACTORY = "0xca143ce32fe78f1f7019d7d551a6402fc5350c73";

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)"
];

const PCS_V2_ABI = [
  "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)",
  // swaps (supporting fee-on-transfer)
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable"
];
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
  res.json({ ok: true, relayReady: Boolean(process.env.BLXR_AUTH), pricebook: true })
);

// Private RPC chain parameters
app.use("/api/private-rpc", require("./routes/privateRpc"));

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

function isHexAddress(s) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(s || "").trim());
}

function normalize(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;

  const U = raw.toUpperCase();
  if (U === "GCC") return GCC;
  if (U === "BNB") return WBNB;          // quote via WBNB

  // If it looks like an address, return canonical lowercase
  if (isHexAddress(raw)) return raw.toLowerCase();

  // Otherwise leave as-is (e.g., future symbol routing)
  return raw;
}

function isPositiveAmount(x) {
  if (x === null || x === undefined) return false;
  const n = Number(String(x));
  return Number.isFinite(n) && n > 0;
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
    if (!sell || !buy) {
      return res.status(400).json({ error: "fromToken and toToken are required" });
    }
    if (!isPositiveAmount(amount)) {
      return res.status(400).json({ error: "amount_must_be_positive" });
    }

    const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC);
    const amountRaw = await toRawAmount(provider, sell, String(amount));

    logInfo("QUOTE: req", { fromToken, toToken, amount, slippageBps, sell, buy, amountRaw });

    let q;
    // 0x primary
    try {
      q = await quoteVia0x({ sell, buy, amountRaw, slippageBps });
      logInfo("QUOTE: 0x OK", { sellAmount: q.sellAmount, buyAmount: q.buyAmount });
    } catch (e0) {
      logWarn("QUOTE: 0x FAIL", String(e0?.message || e0));
      // PCS v2 fallback (multi-path)
      try {
        q = await quoteViaPCSv2({ sell, buy, amount: String(amount) });
        logInfo("QUOTE: PCS OK", { path: q.path, buyAmount: q.buyAmount });
      } catch (ePcs) {
        logErr("QUOTE: PCS FAIL", String(ePcs?.message || ePcs));
        return res.status(502).json({
          error: "no_route",
          details: { ox: String(e0?.message || ""), pcs: String(ePcs?.message || "") }
        });
      }
    }

    // min-received (reflection pad)
    const buyStr = String(q.buyAmount);
    const minStr = ((BigInt(buyStr) * BigInt(10000 - REFLECTION_PAD_BPS)) / 10000n).toString();

    const payload = {
      source: q.source,
      sellToken: sell,
      buyToken: buy,
      sellAmount: String(q.sellAmount),
      buyAmount: buyStr,
      minBuyAmount: minStr,
      slippageBps: Number(slippageBps || DEFAULT_SLIPPAGE_BPS),
      router: q.source === "pcs_v2" ? PCS_V2_ROUTER : undefined,
      at: Date.now()
    };

    logInfo("QUOTE: RESP", { source: payload.source, buy: payload.buyAmount, min: payload.minBuyAmount });
    res.json(payload);
  } catch (err) {
    logErr("QUOTE: HARD FAIL", String(err?.message || err));
    return res.status(502).json({ error: "internal", details: String(err?.message || err) });
  }
}

app.post("/api/quote", handleQuote);
app.post("/quote", handleQuote); // alias

// ---------- Build Approve Tx ----------
app.post("/api/tx/approve", async (req, res) => {
  try {
    const { token, owner, spender, amount } = req.body || {};
    if (!token || !owner || !spender || !amount) {
      return res.status(400).json({ error: "token, owner, spender, amount required" });
    }
    const p = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC);
    const t = new ethers.Contract(String(token).toLowerCase(), ERC20_ABI, p);
    const allowance = await t.allowance(owner, spender);

    const need = ethers.BigNumber.from(String(amount));
    if (allowance.gte(need)) {
      return res.json({ ok: true, needed: false, allowance: allowance.toString() });
    }

    const iface = new ethers.utils.Interface(ERC20_ABI);
    const data = iface.encodeFunctionData("approve", [
      spender,
      ethers.constants.MaxUint256
    ]);

    return res.json({
      ok: true,
      needed: true,
      tx: {
        to: String(token).toLowerCase(),
        data,
        value: "0x0"
      },
      allowance: allowance.toString()
    });
  } catch (e) {
    return res.status(502).json({ error: "approve_build_failed", details: String(e.message || e) });
  }
});

// ---------- Build Swap Tx ----------
app.post("/api/tx/swap", async (req, res) => {
  try {
    const { fromToken, toToken, amountIn, minAmountOut, recipient } = req.body || {};
    if (!fromToken || !toToken || !amountIn || !minAmountOut || !recipient) {
      return res.status(400).json({ error: "fromToken,toToken,amountIn,minAmountOut,recipient required" });
    }

    const sell = String(fromToken).toLowerCase() === "bnb" ? WBNB : String(fromToken).toLowerCase();
    const buy  = String(toToken).toLowerCase()   === "bnb" ? WBNB : String(toToken).toLowerCase();

    const iface   = new ethers.utils.Interface(PCS_V2_ABI);
    const path    = [sell, buy];
    const router  = PCS_V2_ROUTER;
    const deadline = Math.floor(Date.now()/1000) + 60*20; // 20 min

    let method, data, value = "0x0";

    const sellingNative = (String(fromToken).toUpperCase() === "BNB");
    const receivingNative = (String(toToken).toUpperCase() === "BNB");

    if (sellingNative) {
      method = "swapExactETHForTokensSupportingFeeOnTransferTokens";
      data   = iface.encodeFunctionData(method, [ minAmountOut, path, recipient, deadline ]);
      value  = ethers.BigNumber.from(String(amountIn)).toHexString();
    } else if (receivingNative) {
      method = "swapExactTokensForETHSupportingFeeOnTransferTokens";
      data   = iface.encodeFunctionData(method, [ amountIn, minAmountOut, path, recipient, deadline ]);
      value  = "0x0";
    } else {
      method = "swapExactTokensForTokensSupportingFeeOnTransferTokens";
      data   = iface.encodeFunctionData(method, [ amountIn, minAmountOut, path, recipient, deadline ]);
      value  = "0x0";
    }

    return res.json({
      ok: true,
      router,
      method,
      path,
      tx: {
        to: router,
        data,
        value
      }
    });
  } catch (e) {
    return res.status(502).json({ error: "swap_build_failed", details: String(e.message || e) });
  }
});

// ---------- Private Relay ----------
app.post("/api/relay/private", async (req, res) => {
  try {
    const { rawTx } = req.body || {};
    if (!rawTx) return res.status(400).json({ error: "rawTx required" });

    const r = await fetch("https://bsc.blxrbdn.com/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-token": process.env.BLXR_AUTH,
      },
      body: JSON.stringify({ transaction: rawTx }),
    });

    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res
        .status(502)
        .json({ error: "relay_failed", details: json || (await r.text()) });
    }
    res.json({ ok: true, result: json });
  } catch (e) {
    res
      .status(502)
      .json({ error: "relay_error", details: String(e?.message || e) });
  }
});

app.get("/api/pricebook", async (_req, res) => {
  try {
    const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC);
    const router   = new ethers.Contract(PCS_V2_ROUTER, PCS_V2_ABI, provider);

    const oneWBNB = ethers.utils.parseUnits("1", 18);
    const bnbOut = await router.getAmountsOut(oneWBNB, [WBNB, USDT]);
    const bnbUsd = bnbOut[1].toString();

    const oneGCC = ethers.utils.parseUnits("1", 18);
    const gccOut = await router.getAmountsOut(oneGCC, [GCC, WBNB]);
    const gccWbnb = gccOut[1].toString();

    const gccUsd = (BigInt(gccWbnb) * BigInt(bnbUsd) / 10n**18n).toString();

    res.json({
      wbnbUsd: bnbUsd,
      gccWbnb: gccWbnb,
      gccUsd: gccUsd,
      at: Date.now()
    });
  } catch (e) {
    res.status(502).json({ error: "pricebook_failed", details: String(e.message || e) });
  }
});

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
