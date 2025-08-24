import React, { useState, useEffect } from 'react';
import Connect from './components/Connect.jsx';
import SafeSwap from './components/SafeSwap.jsx';

export default function App() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [usedPrivateRpc, setUsedPrivateRpc] = useState(false);

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.request({ method: 'eth_chainId' }).then(setChainId);
    window.ethereum.on('chainChanged', id => setChainId(id));
  }, []);

  const switchRpc = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
      setUsedPrivateRpc(true);
      setChainId('0x38');
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
        setUsedPrivateRpc(true);
        setChainId('0x38');
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
          <span className={`pill ${chainId === '0x38' && usedPrivateRpc ? 'shield-on' : 'shield-off'}`}>
            {chainId === '0x38' && usedPrivateRpc ? 'MEV-Shield ON' : 'MEV-Shield OFF'}
          </span>
        </div>
      </header>
      <SafeSwap account={account} />
    </>
  );
}
