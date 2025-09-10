import { useEffect, useState } from 'react';
import { getBrowserProvider, erc20 } from '../lib/ethers.js';
import { getQuote } from '../lib/api';

const GCC = '0x092aC429b9c3450c9909433eB0662c3b7c13cF9A';
const GCC_DECIMALS = Number(import.meta.env.VITE_GCC_DECIMALS || 9);

export default function useGccUsd(account){
  const [state, setState] = useState({ usd:null, gcc:null, price:null, loading:true, source:null });

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const ONE_GCC = (10n ** BigInt(GCC_DECIMALS)).toString();
        const [gccBnb, bnbUsd] = await Promise.all([
          getQuote({ fromToken: 'GCC', toToken: 'BNB', amountWei: ONE_GCC }),
          getQuote({ fromToken: 'BNB', toToken: 'USDT', amountWei: (10n ** 18n).toString() })
        ]);
        const price = (Number(gccBnb.buyAmount) / 1e18) * (Number(bnbUsd.buyAmount) / 1e18);
        let gccBal = 0;
        if (account) {
          const prov = getBrowserProvider();
          const c = erc20(GCC, prov);
          const raw = await c.balanceOf(account);
          gccBal = Number(raw) / 10 ** GCC_DECIMALS;
        }
        if (!off) setState({ usd: price * gccBal, gcc: gccBal, price, loading:false, source: gccBnb?.source });
      } catch {
        if (!off) setState(s => ({...s, loading:false}));
      }
    })();
    return () => { off = true; };
  }, [account]);

  return state;
}
