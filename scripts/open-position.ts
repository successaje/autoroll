/**
 *  Open a position on a deployed vault: faucet tUSDC if needed, approve, open.
 *
 *  The UI's wallet path does the same thing with a browser signature. This is
 *  the headless equivalent, for driving the keeper without a browser in the loop.
 *
 *    PRIVATE_KEY=0x… npx tsx scripts/open-position.ts \
 *      --vault 0x… --asset BTC --up --stake 50
 */
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  keccak256,
  parseAbi,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { NET } from "../src/config.js";

const TEST_USDC = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E" as const;

const vaultAbi = parseAbi([
  "struct Policy { uint32 maxRolls; uint32 maxLosses; uint32 takeProfitBps; uint32 sizeBps; uint64 maxPriceWad; bool compound; }",
  "function openPosition(bytes32 asset, bool up, uint256 stake, Policy policy) returns (uint256)",
  "function pendingCount(bytes32 asset) view returns (uint256)",
  "function nextPositionId() view returns (uint256)",
  "function collateral() view returns (address)",
]);
const erc20Abi = parseAbi([
  "function faucet(uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
]);

const argv = process.argv.slice(2);
const val = (n: string) => argv[argv.indexOf(`--${n}`) + 1];

const vault = (val("vault") ?? process.env.VAULT_ADDRESS) as Address | undefined;
const asset = (val("asset") ?? "BTC").toUpperCase();
const up = !argv.includes("--down");
const stakeArg = val("stake") ?? "50";
const privateKey = process.env.PRIVATE_KEY as Hex | undefined;

if (!vault || !privateKey) {
  console.error("usage: PRIVATE_KEY=0x… npx tsx scripts/open-position.ts --vault 0x… [--asset BTC] [--up|--down] [--stake 50]");
  process.exit(1);
}

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: NET.chain, transport: http(NET.httpRpcUrl) });
const wallet = createWalletClient({ account, chain: NET.chain, transport: http(NET.httpRpcUrl) });

const decimals = await publicClient.readContract({ address: TEST_USDC, abi: erc20Abi, functionName: "decimals" });
const stake = parseUnits(stakeArg, decimals);
const assetHash = keccak256(toHex(asset));

const send = async (label: string, hash: Hex) => {
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${label} reverted (${hash})`);
  console.log(`  ${label.padEnd(9)} ${hash}`);
};

console.log(`vault    ${vault}`);
console.log(`position ${asset} ${up ? "UP" : "DOWN"} · ${stakeArg} tUSDC · ${account.address}\n`);

let balance = await publicClient.readContract({
  address: TEST_USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address],
});
if (balance < stake) {
  console.log(`balance ${formatUnits(balance, decimals)} < ${stakeArg}, drawing from the faucet`);
  await send("faucet", await wallet.writeContract({
    address: TEST_USDC, abi: erc20Abi, functionName: "faucet", args: [stake * 4n],
  }));
  balance = await publicClient.readContract({
    address: TEST_USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address],
  });
}
console.log(`balance  ${formatUnits(balance, decimals)} tUSDC`);

const allowance = await publicClient.readContract({
  address: TEST_USDC, abi: erc20Abi, functionName: "allowance", args: [account.address, vault],
});
if (allowance < stake) {
  await send("approve", await wallet.writeContract({
    address: TEST_USDC, abi: erc20Abi, functionName: "approve", args: [vault, stake],
  }));
}

await send("open", await wallet.writeContract({
  address: vault,
  abi: vaultAbi,
  functionName: "openPosition",
  args: [assetHash, up, stake, {
    maxRolls: 0,        // unlimited
    maxLosses: 4,       // stop after four straight losses
    takeProfitBps: 0,   // no take-profit
    sizeBps: 2_000,     // stake 20% of bankroll per window
    maxPriceWad: 650_000_000_000_000_000n, // 0.65
    compound: true,
  }],
}));

const [next, pending] = await Promise.all([
  publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "nextPositionId" }),
  publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "pendingCount", args: [assetHash] }),
]);
console.log(`\nposition #${Number(next) - 1} open · ${pending} queued on ${asset}`);
console.log(`\nNow drive it:\n  PRIVATE_KEY=0x… npx tsx src/keeper.ts --vault ${vault} --live --verbose`);
