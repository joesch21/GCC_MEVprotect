module.exports = (app, env) => {
  const { ethers } = require('ethers');
  const provider = new ethers.JsonRpcProvider(env.PUBLIC_RPC);

  const ROUTERS = {
    PANCAKE: env.PANCAKE_ROUTER,
    APESWAP: env.APESWAP_ROUTER || null,
  };
  const TOKENS = {
    GCC: env.TOKEN_GCC,
    WBNB: env.TOKEN_WBNB,
    USDT: env.TOKEN_USDT
  };
  const HOPS = env.DEFAULT_HOPS.split(',').map(h => h.trim()).filter(Boolean).map(h => TOKENS[h]);

  function routerFor(name){
    const addr = ROUTERS[name];
    if (!addr) return null;
    return new ethers.Contract(addr, [
      "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory)",
      "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn,uint amountOutMin,address[] calldata path,address to,uint deadline)"
    ], provider);
  }

  app.get('/api/dex/quote', async (req,res) => {
    try{
      const { sellToken, buyToken, sellAmount } = req.query;
      const order = env.DEX_ORDER.split(',').map(s=>s.trim());
      for (const dexName of order){
        const router = routerFor(dexName);
        if (!router) continue;

        // direct
        try {
          const amounts = await router.getAmountsOut(sellAmount, [sellToken, buyToken]);
          return res.json({ chainId: env.CHAIN_ID, router: ROUTERS[dexName], path: [sellToken,buyToken], sellAmount, buyAmount: amounts.at(-1), amounts: amounts.map(a=>a.toString()) });
        } catch {}

        // hops
        for (const hop of HOPS){
          try{
            if (!hop || hop.toLowerCase()===sellToken.toLowerCase() || hop.toLowerCase()===buyToken.toLowerCase()) continue;
            const path = [sellToken, hop, buyToken];
            const amounts = await router.getAmountsOut(sellAmount, path);
            return res.json({ chainId: env.CHAIN_ID, router: ROUTERS[dexName], path, sellAmount, buyAmount: amounts.at(-1), amounts: amounts.map(a=>a.toString()) });
          }catch{}
        }
      }
      res.status(404).json({ error: 'No route on configured DEXes' });
    }catch(e){
      res.status(500).json({ error: e.message });
    }
  });
};
