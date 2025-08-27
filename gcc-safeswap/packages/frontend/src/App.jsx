import React, { useState, useEffect } from 'react';
import Connect from './components/Connect.jsx';
import SafeSwap from './components/SafeSwap.jsx';
import useShieldStatus from './hooks/useShieldStatus.js';

export default function App() {
  const [account, setAccount] = useState(null);
  const { shieldOn, markPrivateUsed, refreshShield } = useShieldStatus();

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.on('chainChanged', refreshShield);
    return () => { window.ethereum && window.ethereum.removeListener('chainChanged', refreshShield); };
  }, [refreshShield]);

  const switchRpc = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
      markPrivateUsed();
      await refreshShield();
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x38',
            chainName: 'BNB Chain',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: ['https://bscrpc.pancakeswap.finance'],
            blockExplorerUrls: ['https://bscscan.com']
          }]
        });
        markPrivateUsed();
        await refreshShield();
      } else {
        console.error(err);
      }
    }
  };

  return (
    <>
      <header>
        <div>
          <h1>🜲 GCC SafeSwap</h1>
          <p>Private, MEV-protected swaps for Condorians</p>
        </div>
        <div>
          <button onClick={switchRpc}>Use Private RPC</button>
          <Connect account={account} setAccount={setAccount} />
          <span className={`pill ${shieldOn ? 'shield-on' : 'shield-off'}`}>
            {shieldOn ? 'MEV-Shield ON' : 'MEV-Shield OFF'}
          </span>
        </div>
      </header>
      <SafeSwap account={account} />
    </>
  );
}
