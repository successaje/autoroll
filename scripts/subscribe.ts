/**
 *  Wire reactivity on a deployed vault.
 *
 *  Separate from the deploy for a mechanical reason: `forge script` simulates in
 *  Foundry's local EVM, which has no reactivity precompile, so `subscribe`
 *  reverts there and takes the whole deploy down with it. Sent against the live
 *  node — which does have the precompile — the same call works.
 *
 *    PRIVATE_KEY=0x… npx tsx scripts/subscribe.ts --vault 0x…
 *
 *  Needs 33 STT: 32 is a protocol sybil gate the vault holds and never spends,
 *  plus a little gas. Skipping this is not a failure state — the keeper runs the
 *  identical internals through the vault's permissionless poke entries.
 */
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseAbi,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { NET } from "../src/config.js";

const REQUIRED = parseEther("33");

const abi = parseAbi([
  "function fundReactivity() payable",
  "function subscribeAll(uint64 gasLimit, uint256 priorityFeePerGas, uint256 maxFeePerGas) returns (uint256 finalizedSub, uint256 createdSub)",
  "function owner() view returns (address)",
]);

const argv = process.argv.slice(2);
const vault = (argv[argv.indexOf("--vault") + 1] ?? process.env.VAULT_ADDRESS) as Address | undefined;
const privateKey = process.env.PRIVATE_KEY as Hex | undefined;

if (!vault?.startsWith("0x")) {
  console.error("usage: PRIVATE_KEY=0x… npx tsx scripts/subscribe.ts --vault 0x…");
  process.exit(1);
}
if (!privateKey) {
  console.error("PRIVATE_KEY must be in the environment (not on the command line).");
  process.exit(1);
}

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: NET.chain, transport: http(NET.httpRpcUrl) });
const wallet = createWalletClient({ account, chain: NET.chain, transport: http(NET.httpRpcUrl) });

const owner = await publicClient.readContract({ address: vault, abi, functionName: "owner" });
if (owner.toLowerCase() !== account.address.toLowerCase()) {
  console.error(`${account.address} does not own this vault (owner is ${owner}).`);
  process.exit(1);
}

const balance = await publicClient.getBalance({ address: account.address });
console.log(`deployer ${account.address}  ${formatEther(balance)} STT`);
if (balance < REQUIRED) {
  console.error(`\nNeed at least 33 STT, have ${formatEther(balance)}.`);
  console.error("Run the keeper instead — same internals, no funding gate:");
  console.error(`  npx tsx src/keeper.ts --vault ${vault} --live`);
  process.exit(1);
}

console.log("funding the vault with 32 STT (held as a sybil gate, never spent)…");
const fundHash = await wallet.writeContract({
  address: vault, abi, functionName: "fundReactivity", value: parseEther("32"),
});
await publicClient.waitForTransactionReceipt({ hash: fundHash });
console.log(`  ${fundHash}`);

console.log("subscribing to MarketFinalized and MarketCreated…");
const subHash = await wallet.writeContract({
  address: vault, abi, functionName: "subscribeAll",
  args: [10_000_000n, 0n, 20_000_000_000n],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash: subHash });
console.log(`  ${subHash}  (${receipt.status})`);
console.log("\nReactive. The keeper is now a backstop rather than the driver.");
