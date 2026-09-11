/** Keep the complete app URL inside the deep link, including watch and page. */
export function MetaMaskLink() {
  const url = new URL(location.href);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" || local) return <p className="sub">Open this app’s public HTTPS address on your phone to continue in MetaMask.</p>;
  return <a className="cta" href={`https://link.metamask.io/dapp/${url.host}${url.pathname}${url.search}${url.hash}`}>Open in MetaMask</a>;
}
