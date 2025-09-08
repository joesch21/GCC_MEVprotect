export function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
export function metamaskDappLink() {
  const host = window.location.host; // e.g. localhost:5173 or prod domain
  return `https://metamask.app.link/dapp/${host}`;
}
