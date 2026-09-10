/**
 *  Assert the app's hand-written ABI still matches the compiled contract.
 *
 *  This exists because a hand-copied `Policy` struct with `uint32 takeProfitBps`
 *  where the contract has `uint64` produced a DIFFERENT SELECTOR. The call
 *  landed on no function at all and reverted with empty data — indistinguishable
 *  at a glance from a failing token transfer, and it cost an hour of chasing the
 *  wrong thing. Types cannot catch it; only comparing selectors can.
 *
 *    npx tsx scripts/check-abi.ts
 */
import { readFile } from "node:fs/promises";
import { parseAbi, toFunctionSelector, type AbiFunction } from "viem";

const artifact = JSON.parse(
  await readFile(new URL("../contracts/out/AutoRollVault.sol/AutoRollVault.json", import.meta.url), "utf8"),
);

// Pull the parseAbi([...]) block straight out of the app so the check cannot
// drift from what the app actually ships.
const src = await readFile(new URL("../app/src/lib/vault.ts", import.meta.url), "utf8");
// Only the vault's own ABI. The file also declares an ERC-20 ABI for the
// collateral token, whose functions are correctly absent from the vault.
// Anchor on the closing `\n]);` — a lazy match on `])` stops inside the first
// signature that returns an array, e.g. `returns (uint256[])`.
const block = src.match(/vaultAbi\s*=\s*parseAbi\(\[([\s\S]*?)\n\]\);/);
if (!block) {
  console.error("Could not find `vaultAbi = parseAbi([...])` in app/src/lib/vault.ts");
  process.exit(1);
}
const lines = [...block[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
const appAbi = parseAbi(lines);

const sig = (f: AbiFunction) => {
  const t = (i: any): string =>
    i.type === "tuple" ? `(${i.components.map(t).join(",")})` : i.type;
  return `${f.name}(${f.inputs.map(t).join(",")})`;
};

const onChain = new Map<string, string>();
for (const f of artifact.abi as AbiFunction[]) {
  if (f.type === "function") onChain.set(f.name, toFunctionSelector(sig(f)));
}

let bad = 0;
for (const f of appAbi) {
  if (f.type !== "function") continue;
  const want = onChain.get(f.name);
  const got = toFunctionSelector(sig(f as AbiFunction));
  if (!want) {
    console.log(` MISSING  ${sig(f as AbiFunction)} — no such function on the contract`);
    bad++;
  } else if (want !== got) {
    console.log(` MISMATCH ${f.name}\n            app      ${got}  ${sig(f as AbiFunction)}`);
    console.log(`            contract ${want}`);
    bad++;
  } else {
    console.log(`   ok     ${f.name.padEnd(16)} ${got}`);
  }
}

console.log(bad === 0 ? "\nApp ABI matches the compiled contract.\n" : `\n${bad} mismatch(es).\n`);
process.exit(bad === 0 ? 0 : 1);
