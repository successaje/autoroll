/**
 *  Read a deployed vault back and check it is wired to the real protocol.
 *
 *  Constructor arguments are the easiest thing to get silently wrong: a typo in
 *  a collateral address deploys cleanly and then fails on the first order.
 *
 *    npx tsx scripts/verify-vault.ts 0xVault
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { NET } from "../src/config.js";

const EXPECT = {
  module: "0x3ecC694Cef705358864a646142ac17A90E29e388",
  outcomeToken: "0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9",
  collateral: "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E",
} as const;

const abi = parseAbi([
  "function owner() view returns (address)",
  "function module() view returns (address)",
  "function outcomeToken() view returns (address)",
  "function collateral() view returns (address)",
  "function nextPositionId() view returns (uint256)",
  "function finalizedSubId() view returns (uint256)",
  "function createdSubId() view returns (uint256)",
  "function MAX_ROLLS_PER_EVENT() view returns (uint256)",
]);

const vault = process.argv[2] as Address;
if (!vault?.startsWith("0x")) {
  console.error("usage: npx tsx scripts/verify-vault.ts 0xVault");
  process.exit(1);
}

const client = createPublicClient({ chain: NET.chain, transport: http(NET.httpRpcUrl) });
const read = (functionName: string) =>
  client.readContract({ address: vault, abi, functionName: functionName as never });

const code = await client.getCode({ address: vault });
if (!code || code === "0x") {
  console.error(`No contract at ${vault}.`);
  process.exit(1);
}

const [owner, mod, outcome, coll, next, fSub, cSub, cap] = await Promise.all([
  read("owner"), read("module"), read("outcomeToken"), read("collateral"),
  read("nextPositionId"), read("finalizedSubId"), read("createdSubId"),
  read("MAX_ROLLS_PER_EVENT"),
]);

let bad = 0;
const check = (label: string, got: unknown, want: string) => {
  const good = String(got).toLowerCase() === want.toLowerCase();
  if (!good) bad++;
  console.log(`${good ? "  ok " : " BAD "} ${label.padEnd(14)} ${got}`);
};

console.log(`\ncontract         ${vault}  (${(code.length - 2) / 2} bytes)`);
console.log(`  --  owner          ${owner}`);
check("module", mod, EXPECT.module);
check("outcomeToken", outcome, EXPECT.outcomeToken);
check("collateral", coll, EXPECT.collateral);
console.log(`  --  positions      ${Number(next) - 1}`);
console.log(`  --  batch cap      ${cap}`);
console.log(
  `  --  reactivity     ${fSub === 0n && cSub === 0n ? "not subscribed - keeper-driven" : `finalized=${fSub} created=${cSub}`}`,
);
console.log(bad === 0 ? "\nWired correctly.\n" : `\n${bad} address mismatch(es).\n`);
process.exit(bad === 0 ? 0 : 1);
