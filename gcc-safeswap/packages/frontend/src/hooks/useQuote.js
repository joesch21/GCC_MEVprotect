import { toBase } from "../lib/format.js";
import { API_BASE } from "../lib/apiBase.js";

export default function useQuote({ chainId=56 }) {
  async function fetch0x({ fromToken, toToken, amountBase, taker, slippageBps }) {
    const qs = new URLSearchParams({
      chainId:String(chainId), sellToken:fromToken.address, buyToken:toToken.address,
      sellAmount:amountBase, taker, slippageBps:String(slippageBps)
    });
    const r = await fetch(`${API_BASE}/api/0x/quote?${qs}`); const j = await r.json();
    if (j.code || j.error) throw new Error(j.validationErrors?.[0]?.reason || j.error || "0x quote failed");
    const sources = (j.route?.fills?.map(f=>f.source).join(" → ")) || "mixed";
    return { buyAmount:j.buyAmount, tx:{to:j.to, data:j.data, value:j.value}, routeText:sources, lpLabel:null, impact:false, allowanceTarget:j.allowanceTarget };
  }

  async function fetchApe({ fromToken, toToken, amountBase }) {
    const rp = new URLSearchParams({ sellToken: fromToken.address, buyToken: toToken.address });
    const route = await (await fetch(`${API_BASE}/api/apeswap/route?${rp}`)).json();
    const qp = new URLSearchParams({ sellToken: fromToken.address, buyToken: toToken.address, amountIn: amountBase });
    const out = await (await fetch(`${API_BASE}/api/apeswap/amountsOut?${qp}`)).json();
    if (out.error) throw new Error(out.error);
    const path = route.path || out.path || [fromToken.address, toToken.address];
    const sym = (a)=>a.toLowerCase();
    const isGccWbnb = (sym(path[0])===sym(fromToken.address) && path.length===2);
    const lp = isGccWbnb ? "GCC-WBNB LP" : null;
    const pathToSymbols = (tokens, pathArr) => {
      const m = Object.values(tokens).reduce((acc,t)=>{ acc[t.address.toLowerCase()] = t.symbol; return acc; }, {});
      return (pathArr||[]).map(a => m[a.toLowerCase()] || "UNK").join(" → ");
    };
    return { buyAmount:out.amountOut, tx:null, routeText:`${pathToSymbols(window.TOKENS||{}, path)} (ApeSwap)`, lpLabel:lp, impact:false, allowanceTarget:null, path };
  }
  return { fetch0x, fetchApe };
}
