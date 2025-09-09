export function openMetaMaskDapp(url) {
  const target = encodeURIComponent(url);
  window.location.href = `https://metamask.app.link/dapp/${target.replace(/^https?:\/\//, '')}`;
}

