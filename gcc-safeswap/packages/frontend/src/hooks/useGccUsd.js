import { useEffect, useState } from 'react';
import { getBrowserProvider, erc20 } from '../lib/ethers.js';
import { API_BASE } from '../lib/apiBase.js';

const GCC = '0x092aC429b9c3450c9909433eB0662c3b7c13cF9A';
const GCC_DECIMALS = Number(import.meta.env.VITE_GCC_DECIMALS || 9);

export default function useGccUsd(account){
  const [state, setState] = useState({ usd:null, gcc:null, price:null, loading:true, source:null });

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const priceResp = await fetch(`${API_BASE}/api/price/gcc`).then(r=>r.json());
        const price = Number(priceResp?.priceUsd || 0);
        let gccBal = 0;
        if (account) {
          const prov = getBrowserProvider();
          const c = erc20(GCC, prov);
          const raw = await c.balanceOf(account);
          gccBal = Number(raw) / 10 ** GCC_DECIMALS;
        }
        if (!off) setState({ usd: price * gccBal, gcc: gccBal, price, loading:false, source: priceResp?.source });
      } catch {
        if (!off) setState(s => ({...s, loading:false}));
      }
    })();
    return () => { off = true; };
  }, [account]);

  return state;
}
