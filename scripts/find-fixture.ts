/** Finds a (block, marketId, pool) fixture for the end-to-end fork test:
 *  a Trading binary market whose book actually has asks to cross. */
import { isBinaryMarket } from "@somnia-chain/markets-sdk";
import { makeExchange } from "../src/exchange.js";
import { createPublicClient, http } from "viem";

const ex = makeExchange();
const rpc = createPublicClient({ transport: http("https://api.infra.testnet.somnia.network/") });

const block = await rpc.getBlockNumber();
const now = Date.now() / 1000;

for (const m of Object.values(await ex.loadMarkets(true))) {
  const info = m.info as any;
  if (!m.active || !isBinaryMarket(info)) continue;
  const oc = await ex.client.getMarketOnchain(info.marketId as `0x${string}`);
  if (oc.status !== 1) continue;
  const left = Number(oc.expiry) - now;
  if (left < 120) continue; // want headroom so the pin isn't marginal

  const book = await ex.client.getBinaryOrderBook(oc.pool, { depth: 5 });
  if (!book.yesAsks?.length) continue;

  console.log(JSON.stringify({
    blockNumber: block.toString(),
    marketId: info.marketId,
    market: oc.marketAddress,
    pool: oc.pool,
    asset: info.asset,
    intervalSec: info.intervalSec,
    expiry: oc.expiry.toString(),
    secondsLeft: Math.round(left),
    decimals: oc.decimals,
    bestAsk: book.yesAsks[0],
    askDepth: book.yesAsks.length,
  }, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 1));
  process.exit(0);
}
console.log("no suitable market right now");
process.exit(1);
