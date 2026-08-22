import { SomniaMarkets } from "@somnia-chain/markets-sdk";
import { NET } from "./config.js";

/** One exchange per process. `privateKey` is only needed for writes. */
export function makeExchange(privateKey?: `0x${string}`) {
  return new SomniaMarkets({
    indexerUrl: NET.indexerUrl,
    chain: NET.chain,
    wsRpcUrl: NET.wsRpcUrl,
    addresses: NET.addresses,
    ...(privateKey ? { privateKey } : {}),
  });
}
