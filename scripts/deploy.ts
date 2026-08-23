/**
 *  Deploy AutoRollVault to Shannon, sized by the NODE's gas estimate.
 *
 *  `forge script` cannot do this. It estimates in Foundry's local EVM, which
 *  does not know that Somnia prices code deposit at ~5,000 gas/byte instead of
 *  200 — so it sends a limit roughly 17x short, burns all of it, and deploys
 *  nothing. `--gas-limit` does not help: on `forge script` that flag configures
 *  the simulation EVM, not the broadcast transaction.
 *
 *  So the limit comes from `eth_estimateGas` against the live node, which is the
 *  only estimator that knows the real schedule.
 *
 *    PRIVATE_KEY=0x… npx tsx scripts/deploy.ts            # deploy
 *    npx tsx scripts/deploy.ts --dry                      # estimate only, no key
 */
import { readFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  formatEther,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { NET } from "../src/config.js";

const BINARY_MODULE = "0x3ecC694Cef705358864a646142ac17A90E29e388" as const;
const OUTCOME_TOKEN = "0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9" as const;
const TEST_USDC = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E" as const;

/** Head-room over the node's estimate. Unused gas is refunded, so this is free. */
const GAS_CUSHION = 150n; // percent

const dry = process.argv.includes("--dry");
const artifact = JSON.parse(
  await readFile(new URL("../contracts/out/AutoRollVault.sol/AutoRollVault.json", import.meta.url), "utf8"),
);

const data = encodeDeployData({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object as Hex,
  args: [BINARY_MODULE, OUTCOME_TOKEN, TEST_USDC],
});

const publicClient = createPublicClient({ chain: NET.chain, transport: http(NET.httpRpcUrl) });

const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
if (!dry && !privateKey) {
  console.error("PRIVATE_KEY must be in the environment. Or pass --dry to estimate only.");
  process.exit(1);
}
const account = privateKey ? privateKeyToAccount(privateKey) : undefined;
// A from-address only changes the estimate via balance checks; any address does
// for a dry run.
const from = account?.address ?? ("0x60eF148485C2a5119fa52CA13c52E9fd98F28e87" as Address);

const estimate = await publicClient.estimateGas({ account: from, data });
const gas = (estimate * GAS_CUSHION) / 100n;
const fees = await publicClient.estimateFeesPerGas();
const maxFee = fees.maxFeePerGas ?? 12_000_000_000n;

console.log(`runtime code   ${(artifact.deployedBytecode.object.length - 2) / 2} bytes`);
console.log(`node estimate  ${estimate.toLocaleString()} gas`);
console.log(`sending with   ${gas.toLocaleString()} gas (${GAS_CUSHION}%)`);
console.log(`worst-case fee ${formatEther(gas * maxFee)} STT`);
console.log(`likely cost    ${formatEther(estimate * maxFee)} STT`);

if (dry || !account) {
  console.log("\n--dry: nothing sent.");
  process.exit(0);
}

const balance = await publicClient.getBalance({ address: account.address });
console.log(`\ndeployer       ${account.address}  ${formatEther(balance)} STT`);
if (balance < gas * maxFee) {
  console.error("Not enough STT to cover the worst case. Top up the deployer.");
  process.exit(1);
}

const wallet = createWalletClient({ account, chain: NET.chain, transport: http(NET.httpRpcUrl) });
const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object as Hex,
  args: [BINARY_MODULE, OUTCOME_TOKEN, TEST_USDC],
  gas,
});
console.log(`\ntx ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
const address = receipt.contractAddress;
console.log(`status ${receipt.status}  gasUsed ${receipt.gasUsed.toLocaleString()} / ${gas.toLocaleString()}`);

if (receipt.status !== "success" || !address) {
  console.error("\nDeploy FAILED. Nothing was deployed.");
  process.exit(1);
}

// A success status is not proof: an out-of-gas code deposit is exactly what bit
// us before, so confirm there are actually bytes at the address.
const code = await publicClient.getCode({ address });
if (!code || code === "0x") {
  console.error(`\nNo code at ${address} despite a success status.`);
  process.exit(1);
}

console.log(`\nAutoRollVault  ${address}  (${(code.length - 2) / 2} bytes)`);
console.log(`\nDrive it now:  npx tsx src/keeper.ts --vault ${address} --live`);
console.log(`Reactivity:    npm run subscribe -- --vault ${address}   (needs 33 STT)`);
