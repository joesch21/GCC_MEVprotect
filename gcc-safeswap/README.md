# GCC SafeSwap

GCC SafeSwap is a ritual‑themed swap interface that protects trades on BNB Chain from front‑running and sandwich attacks.  It provides three hardened swap paths:

* **Private RPC Mode** – standard transaction signing with broadcast to a private mempool RPC such as PancakeSwap MEV Guard.
* **0x Aggregator Mode** – firm RFQ quotes from the 0x Swap API with configurable slippage protection and private relay.
* **ApeSwap Router Mode** – direct on‑chain swaps through the ApeSwap router with GCC/WBNB LP preference.

The project is organised as a monorepo with separate frontend and backend packages.

## Features

* MetaMask connection with short address display.
* One‑click switch to the PancakeSwap MEV Guard RPC on BNB Chain.
* Token swap card supporting BNB, WBNB, GCC, USDT and BTCB.
* Calls to a backend proxy for 0x pricing/quotes, ApeSwap routing and raw transaction relays.
* Embedded burner wallet for demo server relays (not for production use).

## Quick Start

```bash
cd packages/backend
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

All secrets such as aggregator API keys, custom private RPC URLs and address overrides are loaded from environment variables on the backend.  Never expose secrets in the frontend bundle.

## Adding Tokens

The token list includes BNB, WBNB, GCC, USDT and BTCB.  To add more tokens or icons edit `src/lib/tokens-bsc.js` in the frontend package.

## Private RPC Switching

The “Use Private RPC” button instructs MetaMask to switch to BNB Chain using the PancakeSwap MEV Guard RPC (`https://bscrpc.pancakeswap.finance`).  Alternative RPC endpoints can be configured in the backend `.env` file and documented for users.

## Limitations & Next Steps

* 1inch Fusion intents are not yet implemented; a server stub exists and README notes document the intended EIP‑712 order flow.
* 0x Gasless swaps via Permit2 are future work.
* Production wallets should replace the demo burner with session keys, MPC or similar.
* GCC gating (NFT or token balance checks) is planned but not yet active.

Screenshots or GIFs should demonstrate the full flow: connect → switch RPC → quote → approve → swap.

