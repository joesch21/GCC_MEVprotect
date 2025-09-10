const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const { writeFileSync } = require('fs');

async function updateBotRegistryFromDexscreener() {
  const url = process.env.DEXSCREENER_TOKEN_URL;
  const r = await fetch(url);
  const j = await r.json();

  const trades = (j?.pairs?.[0]?.txns?.m5 || []).map(x => ({
    txId: x.txid,
    blockNumber: x.blockNumber ?? 0,
    side: x.side,
    priceUsd: x.priceUsd,
    maker: x.maker
  }));

  const suspect = new Map();
  const byBlock = new Map();
  trades.forEach(t => {
    const arr = byBlock.get(t.blockNumber) || [];
    arr.push(t);
    byBlock.set(t.blockNumber, arr);
  });

  for (const [block, arr] of byBlock) {
    arr.sort((a,b) => a.txId.localeCompare(b.txId));
    for (let i=1;i<arr.length-1;i++){
      const prev = arr[i-1], v = arr[i], next = arr[i+1];
      if (prev.maker && next.maker && prev.maker === next.maker && prev.side==='buy' && next.side==='sell') {
        suspect.set(prev.maker.toLowerCase(), (suspect.get(prev.maker.toLowerCase())||0)+1);
      }
    }
  }

  const deny = [...suspect.entries()].filter(([,n])=>n>=3).map(([a])=>a);
  if (deny.length) {
    const registry = { denylist: deny, watchlist: [], updatedAt: new Date().toISOString() };
    writeFileSync('./condor_mev_registry.json', JSON.stringify(registry, null, 2));
    console.log('Updated local MEV registry:', registry);
  }
}

module.exports = { updateBotRegistryFromDexscreener };
