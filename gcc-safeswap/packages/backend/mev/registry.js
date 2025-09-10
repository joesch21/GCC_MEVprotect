const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

let denylist = [];
let watchlist = [];

async function refreshRegistry() {
  try {
    const url = process.env.MEV_REGISTRY_URL;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    denylist = (j.denylist || []).map(a => a.toLowerCase());
    watchlist = (j.watchlist || []).map(a => a.toLowerCase());
    console.log('MEV registry loaded:', denylist.length, 'deny,', watchlist.length, 'watch');
  } catch (e) {
    console.error('MEV registry load failed', e);
  }
}

function isDenied(addr) {
  return !!addr && denylist.includes(addr.toLowerCase());
}
function isWatched(addr) {
  return !!addr && watchlist.includes(addr.toLowerCase());
}

module.exports = { refreshRegistry, isDenied, isWatched };
