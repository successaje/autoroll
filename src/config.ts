import { SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";

/** Shannon testnet (chain 50312). Protocol core is CREATE3'd, so these
 *  addresses are byte-identical on mainnet — only the collateral differs. */
export const NET = {
  chain: somniaShannon,
  indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
  wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
  httpRpcUrl: "https://api.infra.testnet.somnia.network/",
  addresses: SOMNIA_TESTNET_ADDRESSES,
} as const;

/** Reactivity precompile + the two module events AutoRoll subscribes to.
 *  Topic0s verified against live testnet logs — see scripts/decode-logs.mjs. */
export const REACTIVITY_PRECOMPILE = "0x0000000000000000000000000000000000000100" as const;
export const BINARY_MODULE = "0x3ecC694Cef705358864a646142ac17A90E29e388" as const;
export const TOPIC_MARKET_FINALIZED =
  "0x8f396ac6cf2e01887362e2b39d8e56860042c604e5b1b481c87e6d9f90006e08" as const;
export const TOPIC_MARKET_CREATED =
  "0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd" as const;
