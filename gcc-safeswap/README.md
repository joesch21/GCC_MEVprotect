# GCC SafeSwap

GCC SafeSwap is a ritual‑themed swap interface that protects trades on BNB Chain from front‑running and sandwich attacks.  It provides two hardened swap paths:

* **Private RPC Mode** – obtain a standard 0x quote (or 1inch later) and broadcast the transaction through a private mempool RPC such as PancakeSwap MEV Guard.
* **Shielded (Aggregator) Mode** – request firm RFQ quotes from the 0x Swap API with configurable slippage protection and broadcast privately.

The project is organised as a monorepo with separate frontend and backend packages.

## Features

* MetaMask connection with short address display.
* One‑click switch to the PancakeSwap MEV Guard RPC on BNB Chain.
* Token swap card supporting BNB/WBNB/USDT (placeholder for GCC and more).
* Calls to a backend proxy for 0x pricing/quotes and raw transaction relays.
* Embedded burner wallet for demo server relays (not for production use).

## Quick Start

```bash
cd packages/backend
cp .env.example .env   # populate keys (do **not** commit .env)
yarn
node server.cjs
```

In another terminal:

```bash
cd packages/frontend
yarn
yarn dev
```

The frontend (Vite) proxies `/api/*` requests to the backend server.

## Environment

All secrets such as aggregator API keys and custom private RPC URLs are loaded from environment variables on the backend.  Never expose secrets in the frontend bundle.  See [packages/backend/.env.example](packages/backend/.env.example) for available variables.

## Adding Tokens

The initial token list contains BNB, WBNB and USDT.  To add more tokens, including the GCC token and icons, edit `src/lib/tokens-bsc.js` in the frontend package.

## Private RPC Switching

The “Use Private RPC” button instructs MetaMask to switch to BNB Chain using the PancakeSwap MEV Guard RPC (`https://bscrpc.pancakeswap.finance`).  Alternative RPC endpoints can be configured in the backend `.env` file and documented for users.

## Limitations & Next Steps

* 1inch Fusion intents are not yet implemented; a server stub exists and README notes document the intended EIP‑712 order flow.
* 0x Gasless swaps via Permit2 are future work and documented for server‑side implementation.
* Production wallets should replace the demo burner with session keys, MPC or similar.
* GCC gating (NFT or token balance checks) is planned but not yet active.

Screenshots or GIFs should demonstrate the full flow: connect → switch RPC → quote → approve → swap.

