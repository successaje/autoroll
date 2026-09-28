import { useEffect, useState } from "react";

const ENDPOINT =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true";
const IDS: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum" };
/** CoinGecko's free tier is rate limited per IP, and a spot reference does not
 *  need to be fresher than this. */
const INTERVAL = 60_000;

export interface Price {
  usd: number;
  change24h: number;
}

/**
 *  Spot reference prices for the tradable assets.
 *
 *  Deliberately labelled as a reference in the UI and never as a settlement
 *  price: dreamDEX windows settle against Somnia's oracle comparing the open to
 *  the close, not against this number. Showing it as "the price" would imply a
 *  precision over settlement that it does not have.
 *
 *  Binance, Coinbase and Kraken all refuse cross-origin requests from the
 *  browser here, which is why this is the source.
 */
export function usePrices() {
  const [prices, setPrices] = useState<Record<string, Price>>({});

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch(ENDPOINT);
        if (!res.ok) return;
        const body = await res.json();
        if (!alive) return;
        const next: Record<string, Price> = {};
        for (const [symbol, id] of Object.entries(IDS)) {
          const row = body?.[id];
          if (typeof row?.usd === "number") {
            next[symbol] = { usd: row.usd, change24h: row.usd_24h_change ?? 0 };
          }
        }
        if (Object.keys(next).length) setPrices(next);
      } catch {
        // A missing price hides the line; it never blocks the page. Keeping the
        // last good values is better than flashing a dash on one bad poll.
      }
    }

    void load();
    const t = setInterval(load, INTERVAL);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return prices;
}

export function formatUsd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}
