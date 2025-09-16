const fetch = require("node-fetch");
const Redis = require("ioredis");

const PRICEBOOK_URL = process.env.PRICEBOOK_URL || "https://upstream.example/pricebook";
const REDIS_URL = process.env.REDIS_URL || null;
const CACHE_KEY = "pricebook:last_good";
const CIRCUIT_FAIL_THRESHOLD = 5;
const CIRCUIT_OPEN_MS = 30 * 1000; // 30s
const UPSTREAM_RETRY = 3;

let redis = null;
if (REDIS_URL) {
  redis = new Redis(REDIS_URL);
}

// in-memory fallback cache & circuit state
let inMemoryCache = null; // { data, lastUpdated }
let circuit = {
  failureCount: 0,
  openUntil: 0,
};

function nowMs() {
  return Date.now();
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function readCache() {
  if (redis) {
    try {
      const raw = await redis.get(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_err) {
      // Redis read failed — fall back to in-memory
    }
  }
  return inMemoryCache;
}

async function writeCache(payload) {
  if (redis) {
    try {
      await redis.set(CACHE_KEY, JSON.stringify(payload), "EX", 60 * 60 * 24); // keep 24h by default
    } catch (_err) {
      // ignore redis set error; keep memory cache
    }
  }
  inMemoryCache = payload;
}

/**
 * Basic schema validation for the pricebook.
 * This is intentionally conservative: require a top-level 'tokens' array.
 */
function validateSchema(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (!Array.isArray(obj.tokens)) return false;
  return true;
}

/**
 * Small circuit-breaker check. If open, returns true.
 */
function isCircuitOpen() {
  return circuit.openUntil && nowMs() < circuit.openUntil;
}

/**
 * Record a failure in the circuit breaker and potentially open it.
 */
function recordFailure() {
  circuit.failureCount += 1;
  if (circuit.failureCount >= CIRCUIT_FAIL_THRESHOLD) {
    circuit.openUntil = nowMs() + CIRCUIT_OPEN_MS;
  }
}

/**
 * Reset circuit to healthy state.
 */
function resetCircuit() {
  circuit.failureCount = 0;
  circuit.openUntil = 0;
}

/**
 * Fetch upstream with retries + exponential backoff.
 * Throws if all attempts fail.
 */
async function fetchUpstreamWithRetries(url, retries = UPSTREAM_RETRY) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`UPSTREAM_HTTP_${res.status}`);
      }
      const json = await res.json();
      return json;
    } catch (err) {
      attempt += 1;
      if (attempt >= retries) throw err;
      const backoff = 200 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      await sleep(backoff);
    }
  }
  throw new Error("UPSTREAM_FAILED");
}

/**
 * Main exported function.
 *
 * Returns:
 *  { data, lastUpdated, stale: boolean, lastError?: string, staleSchema?: boolean }
 *
 * Throws only if there's NO cached payload and upstream failed.
 */
async function getPricebook() {
  // If circuit is open — return cached immediately if present
  if (isCircuitOpen()) {
    const cached = await readCache();
    if (cached) {
      return {
        data: cached.data,
        lastUpdated: cached.lastUpdated,
        stale: true,
        lastError: "CIRCUIT_OPEN",
      };
    }
    // no cache, continue to attempt a fresh fetch (but we might fail)
  }

  try {
    const upstream = await fetchUpstreamWithRetries(PRICEBOOK_URL, UPSTREAM_RETRY);
    // validate
    const valid = validateSchema(upstream);
    const payload = {
      data: upstream,
      lastUpdated: new Date().toISOString(),
    };

    await writeCache(payload);
    resetCircuit();

    return {
      data: upstream,
      lastUpdated: payload.lastUpdated,
      stale: !valid,
      staleSchema: !valid,
    };
  } catch (err) {
    // upstream failed — increment circuit failure
    recordFailure();
    const cached = await readCache();
    if (cached) {
      return {
        data: cached.data,
        lastUpdated: cached.lastUpdated,
        stale: true,
        lastError: err.message || String(err),
      };
    }
    // no cache — bubble up so caller can map to 200+empty or handle as they prefer
    const e = new Error("UPSTREAM_FAILED_NO_CACHE");
    e.cause = err;
    throw e;
  }
}

const __test_helpers__ = {
  async clearCache() {
    inMemoryCache = null;
    if (redis) {
      try {
        await redis.del(CACHE_KEY);
      } catch (_err) {
        // ignore
      }
    }
  },
  resetCircuit() {
    resetCircuit();
  },
  _forceSetCache(payload) {
    inMemoryCache = payload;
  },
};

module.exports = {
  getPricebook,
  __test_helpers__,
};
