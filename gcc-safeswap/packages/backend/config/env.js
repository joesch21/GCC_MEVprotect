const envalid = require('envalid');
const { str, num } = envalid;

const env = envalid.cleanEnv(process.env, {
  NODE_ENV:      str({ default: 'development' }),
  PORT:          num({ default: 8787 }),
  ALLOWED_ORIGINS: str({ default: 'http://localhost:5173' }),

  CHAIN_ID:      num({ default: 56 }),
  PUBLIC_RPC:    str(),
  PRIVATE_RPC:   str({ default: '' }),

  ZEROX_API_KEY: str({ default: '' }),

  TOKEN_GCC:     str(),
  TOKEN_WBNB:    str(),
  TOKEN_USDT:    str(),

  PANCAKE_ROUTER: str(),
  APESWAP_ROUTER: str({ default: '' }),
  DEX_ORDER:      str({ default: 'PANCAKE,APESWAP' }),
  DEFAULT_HOPS:   str({ default: 'WBNB,USDT' }),

  RELAYER_PRIVATE_KEY: str({ default: '' }),
  RELAYER_FROM_ADDRESS: str({ default: '' }),

  COINGECKO_ID:  str({ default: '' }),
  DEXSCREENER_PAIR_GCC_WBNB: str({ default: '' }),

  LOG_LEVEL:     str({ default: 'info' }),
});

function summarize(mask = true) {
  const maskHex = v => (mask && v?.startsWith('0x') ? v.slice(0,6)+'…'+v.slice(-4) : v);
  return {
    CHAIN_ID: env.CHAIN_ID,
    PUBLIC_RPC: env.PUBLIC_RPC,
    PRIVATE_RPC: env.PRIVATE_RPC ? 'set' : 'not set',
    ZEROX_API_KEY: env.ZEROX_API_KEY ? 'set' : 'not set',
    TOKENS: {
      GCC: maskHex(env.TOKEN_GCC),
      WBNB: maskHex(env.TOKEN_WBNB),
      USDT: maskHex(env.TOKEN_USDT),
    },
    ROUTERS: {
      PANCAKE: maskHex(env.PANCAKE_ROUTER),
      APESWAP: env.APESWAP_ROUTER ? maskHex(env.APESWAP_ROUTER) : 'not set',
      ORDER: env.DEX_ORDER,
      HOPS: env.DEFAULT_HOPS,
    },
    RELAYER: env.RELAYER_PRIVATE_KEY ? 'enabled' : 'disabled',
  };
}

module.exports = { env, summarize };
