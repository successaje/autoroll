import { isBinaryMarket } from "@somnia-chain/markets-sdk";
import type { makeExchange } from "./exchange.js";

export interface Window {
  marketId: `0x${string}`;
  pool: `0x${string}`;
  asset: string;
  symbolUp: string;
  symbolDown: string;
  expiry: number;
  secondsLeft: number;
  intervalSec: number;
  decimals: number;
  tickSize: bigint;
  lotSize: bigint;
  minQuantity: bigint;
}

const pow10 = (n: number) => 10n ** BigInt(n);

/**
 *  Live windows, gated the way the Gotchas page insists on:
 *   #1  trust the on-chain status, not the indexer row
 *   #9  skip windows with no expiry headroom — they lock mid-flight
 *   #12 key by marketId; the pool address is a time-varying binding
 *   #13 read the typed `asset`, never regex the question text
 */
export async function liveWindows(
  exchange: ReturnType<typeof makeExchange>,
  minSecondsLeft = 8,
): Promise<Window[]> {
  const now = Date.now() / 1000;
  const out: Window[] = [];

  for (const m of Object.values(await exchange.loadMarkets(true))) {
    const info = m.info as any;
    if (!m.active || !isBinaryMarket(info)) continue;

    const marketId = info.marketId as `0x${string}`;
    const onchain = await exchange.client.getMarketOnchain(marketId);
    if (onchain.status !== 1) continue; // 1 = Trading

    const secondsLeft = Number(onchain.expiry) - now;
    if (secondsLeft < minSecondsLeft) continue;

    const [up, down] = m.outcomes ?? [];
    if (!up || !down) continue;

    // The venue quotes prices and sizes on a grid; `precision` is the decimal
    // count, so the raw increment is 10^(decimals - precision).
    const decimals = onchain.decimals;
    const tickSize = pow10(decimals - (m.precision?.price ?? 3));
    const lotSize = pow10(decimals - (m.precision?.amount ?? 3));

    out.push({
      marketId,
      pool: onchain.pool,
      asset: info.asset,
      symbolUp: up.symbol,
      symbolDown: down.symbol,
      expiry: Number(onchain.expiry),
      secondsLeft,
      intervalSec: Number(info.intervalSec ?? 0),
      decimals,
      tickSize,
      lotSize,
      minQuantity: BigInt(
        Math.round((m.limits?.amount?.min ?? 0.001) * Number(pow10(decimals))),
      ),
    });
  }
  return out.sort((a, b) => a.secondsLeft - b.secondsLeft);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { makeExchange } = await import("./exchange.js");
  const w = await liveWindows(makeExchange());
  console.log(`live trading windows: ${w.length}`);
  for (const x of w.slice(0, 10))
    console.log(
      `  ${x.asset.padEnd(4)} ${String(x.intervalSec).padStart(5)}s cadence  ` +
        `${x.secondsLeft.toFixed(0).padStart(5)}s left  ${x.symbolUp}`,
    );
  process.exit(0);
}
