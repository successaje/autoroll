import { isBinaryMarket } from "@somnia-chain/markets-sdk";
import { makeExchange } from "./exchange.js";

/** Gotcha #1/#9: gate on live on-chain status (1 = Trading), skip windows
 *  with no expiry headroom. Gotcha #12: key by marketId, never pool address. */
export async function liveWindows(exchange: ReturnType<typeof makeExchange>, minSecondsLeft = 15) {
  const now = Date.now() / 1000;
  const out: Array<{ marketId: `0x${string}`; symbolUp: string; symbolDown: string;
                     asset: string; expiry: number; secondsLeft: number; pool: string }> = [];

  for (const m of Object.values(await exchange.loadMarkets(true))) {
    if (!m.active || !isBinaryMarket(m.info)) continue;
    const marketId = m.info.marketId as `0x${string}`;
    const onchain = await exchange.client.getMarketOnchain(marketId);
    if (onchain.status !== 1) continue;
    const secondsLeft = Number(onchain.expiry) - now;
    if (secondsLeft < minSecondsLeft) continue;
    const [up, down] = m.outcomes ?? [];
    if (!up || !down) continue;
    // Gotcha #13: read typed `asset`, never parse the question text.
    out.push({ marketId, symbolUp: up.symbol, symbolDown: down.symbol,
               asset: (m.info as any).asset, expiry: Number(onchain.expiry),
               secondsLeft, pool: String((m.info as any).poolAddress ?? "") });
  }
  return out.sort((a, b) => a.secondsLeft - b.secondsLeft);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ex = makeExchange();
  const w = await liveWindows(ex);
  console.log(`live trading windows: ${w.length}`);
  for (const x of w.slice(0, 8))
    console.log(`  ${x.asset.padEnd(4)} ${x.secondsLeft.toFixed(0).padStart(4)}s left  ${x.symbolUp}`);
  process.exit(0);
}
