/**
 *  Pre-deploy safety check for a deployer ADDRESS — never a key.
 *
 *  The protocol core is CREATE3-deployed, so the same addresses exist on Shannon
 *  and on Somnia mainnet. A key reused across projects can quietly hold real
 *  SOMI, and a misdirected deploy is not reversible. This says, before you spend
 *  anything, exactly what the address holds on both networks.
 *
 *    npx tsx scripts/preflight.ts 0xYourDeployerAddress
 */
import { createPublicClient, formatEther, http, type Address } from "viem";
import { NET } from "../src/config.js";

const MAINNET_RPC = "https://api.infra.mainnet.somnia.network/";
const REACTIVITY_MIN = 32n * 10n ** 18n;
/** Above this, treat the address as one that holds value and refuse to proceed.
 *  Below it but non-zero is worth saying out loud — dust arrives unbidden at
 *  well-known addresses — without blocking a deploy over a rounding error. */
const MAINNET_STOP = 10n ** 16n; // 0.01 SOMI

const address = process.argv[2] as Address;
if (!address?.startsWith("0x") || address.length !== 42) {
  console.error("usage: npx tsx scripts/preflight.ts <deployerAddress>");
  console.error("Pass an ADDRESS. Never paste a private key into a command.");
  process.exit(1);
}

const testnet = createPublicClient({ chain: NET.chain, transport: http(NET.httpRpcUrl) });
const mainnet = createPublicClient({ transport: http(MAINNET_RPC) });

const [stt, somi] = await Promise.all([
  testnet.getBalance({ address }),
  mainnet.getBalance({ address }).catch(() => null),
]);

console.log(`\naddress            ${address}`);
console.log(`Shannon testnet    ${formatEther(stt)} STT`);
console.log(`Somnia mainnet     ${somi === null ? "(unreachable)" : `${formatEther(somi)} SOMI`}`);

console.log("");
if (somi !== null && somi >= MAINNET_STOP) {
  console.log("STOP. This address holds real SOMI on mainnet.");
  console.log("Use a throwaway deployer for testnet instead of a key with value on it.");
  process.exit(2);
}
if (somi !== null && somi > 0n) {
  console.log("Note: a dust mainnet balance is present. Not blocking, but confirm this");
  console.log("is a throwaway deployer and not a key you use for anything real.\n");
}

if (stt === 0n) {
  console.log("No STT. Fund the deployer before deploying:");
  console.log("  https://testnet.somnia.network/");
  console.log("  https://cloud.google.com/application/web3/faucet/somnia/shannon");
  process.exit(1);
}

console.log(stt >= REACTIVITY_MIN + 10n ** 18n
  ? "Enough for deploy AND reactivity (>= 33 STT) — subscribeAll will run."
  : "Enough to deploy. Under 33 STT, so it deploys WITHOUT reactivity and the\nkeeper drives it instead — which is a supported mode, not a degraded one.");
console.log("");
