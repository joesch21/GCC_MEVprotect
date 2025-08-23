import React from 'react';
import { getProvider } from '../lib/ethers';
import { shorten } from '../lib/format';

export default function Connect({ account, setAccount }) {
  const connect = async () => {
    try {
      const provider = getProvider();
      const accounts = await provider.send('eth_requestAccounts', []);
      setAccount(accounts[0]);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <button onClick={connect}>
      {account ? shorten(account) : 'Connect MetaMask'}
    </button>
  );
}
