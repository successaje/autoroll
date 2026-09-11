/**
 *  End-to-end keeper verification against a pinned fork.
 *
 *  Replays the REAL MarketCreated log for the fixture window out of module
 *  history, decodes the asset from it, gates on the vault's own pending count,
 *  and sends a real `pokeCreated` — then checks the position actually entered.
 *
 *    anvil --fork-url <shannon> --fork-block-number 468558054
 *    forge script script/SeedKeeper.s.sol --rpc-url http://localhost:8545 --broadcast --private-key <anvil-0>
 *    npx tsx scripts/verify-keeper.ts <vaultAddress>
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { Keeper } from "../src/keeper.js";
import { NET } from "../src/config.js";

const RPC = "http://localhost:8545";
/** anvil's default account #0. Public, shipped with Foundry, funded only on a
 *  local node — this is a fixture, not a secret. */
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const CREATION_BLOCK = 468556900n; // the fixture window's MarketCreated
const FORK_TS = 1787428615; // the fixture block's own timestamp

const vault = process.argv[2] as Address;
if (!vault) {
  console.error("usage: tsx scripts/verify-keeper.ts <vaultAddress>");
  process.exit(1);
}

const abi = parseAbi([
  "function positions(uint256) view returns (address user, bytes32 asset, bool up, uint256 principal, uint256 bankroll, uint256 atRisk, uint256 quantity, uint32 rolls, uint32 losses, bool active, (uint32,uint32,uint64,uint32,uint64,bool) policy)",
  "function pendingCount(bytes32 asset) view returns (uint256)",
  "function inMarketCount(bytes32 marketId) view returns (uint256)",
]);
const client = createPublicClient({ chain: NET.chain, transport: http(RPC) });
const ETH_ID = "0xaaaebeba3810b1e6b70781f14b2d72c1cb89c0b2b320c43bb67ff79f562f5ff4" as const;

/**
 *  Pin anvil's clock to the fork block's timestamp before poking.
 *
 *  Anvil advances block timestamps from wall clock, and the fixture's resting
 *  maker orders carry short expiries — the docs recommend setting order expiry
 *  just past the requote interval, which for a 60s requoter is seconds. Even ~30
 *  seconds of drift while the harness starts up ages every level off the book,
 *  and the keeper then correctly finds nothing to fill. Rewinding the clock puts
 *  the book back exactly as it was at the pinned block.
 */
await fetch(RPC, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "evm_setTime", params: [FORK_TS] }),
});

const before = await client.readContract({ address: vault, abi, functionName: "positions", args: [1n] });
const pendingBefore = await client.readContract({ address: vault, abi, functionName: "pendingCount", args: [ETH_ID] });
console.log(`before  pending=${pendingBefore}  quantity=${before[6]}  atRisk=${before[5]}  bankroll=${before[4]}`);

await new Keeper({
  vault,
  live: true,
  privateKey: ANVIL_KEY,
  rpcUrl: RPC,
  fromBlock: CREATION_BLOCK,
  once: true,
}).run();

const after = await client.readContract({ address: vault, abi, functionName: "positions", args: [1n] });
const pendingAfter = await client.readContract({ address: vault, abi, functionName: "pendingCount", args: [ETH_ID] });
console.log(`after   pending=${pendingAfter}  quantity=${after[6]}  atRisk=${after[5]}  bankroll=${after[4]}`);

const ok = after[6] > 0n && after[5] > 0n && pendingAfter === 0n && after[4] + after[5] === before[4];
console.log(ok ? "\nPASS — the keeper drove a real entry" : "\nFAIL — the position did not enter");
process.exit(ok ? 0 : 1);
