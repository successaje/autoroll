import { shannon, VAULT } from "../lib/chain";

const BASE = shannon.blockExplorers.default.url;

/** `tab` opens a specific view: "txs" is the address's transaction list and
 *  "internal_txns" is the calls it made into other contracts — for the vault
 *  those are its own entries and redemptions on dreamDEX. */
export const explorerAddress = (address: string, tab?: "txs" | "internal_txns") =>
  `${BASE}/address/${address}${tab ? `?tab=${tab}` : ""}`;
export const explorerTx = (hash: string) => `${BASE}/tx/${hash}`;

/** Shorten a hash for display without losing the ends people actually compare. */
export function shortHash(value: string, lead = 6, tail = 4) {
  return value.length > lead + tail + 2 ? `${value.slice(0, lead)}…${value.slice(-tail)}` : value;
}

/**
 *  A link out to the block explorer.
 *
 *  Every claim this app makes about a position is read from the vault, so the
 *  vault is the thing worth letting someone open. Nothing here is asserted by a
 *  server we control, and this is where that stops being a promise.
 */
export function ExplorerLink({
  address = VAULT,
  hash,
  tab,
  children,
  className = "explorer-link",
}: {
  address?: string;
  hash?: string;
  tab?: "txs" | "internal_txns";
  children?: React.ReactNode;
  className?: string;
}) {
  const href = hash ? explorerTx(hash) : address ? explorerAddress(address, tab) : null;
  if (!href) return null;
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children ?? shortHash(hash ?? address ?? "")}
      <span aria-hidden="true">↗</span>
    </a>
  );
}
