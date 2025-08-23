import { BrowserProvider, Contract, MaxUint256, Wallet, JsonRpcProvider } from 'ethers';

export const getProvider = () => {
  if (!window.ethereum) throw new Error('MetaMask not found');
  return new BrowserProvider(window.ethereum);
};

export const getSigner = async () => {
  const provider = getProvider();
  return provider.getSigner();
};

export const getBurner = () => {
  let pk = localStorage.getItem('burner');
  if (!pk) {
    const wallet = Wallet.createRandom();
    pk = wallet.privateKey;
    localStorage.setItem('burner', pk);
  }
  return new Wallet(pk);
};

export const getRpcProvider = () => new JsonRpcProvider('https://bscrpc.pancakeswap.finance');

export { Contract, MaxUint256 };
