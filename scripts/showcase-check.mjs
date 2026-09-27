import { createPublicClient, fallback, formatEther, formatUnits, http, parseAbi } from "viem";

const VAULT = "0xf0802c0c94bec42ac93bc7439724df04674a7a39";
const MODULE = "0x3ecC694Cef705358864a646142ac17A90E29e388";
const COLLATERAL = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E";
const KEEPER_HEALTH_URL = process.env.KEEPER_HEALTH_URL ?? "http://127.0.0.1:8080/health";
const RPCS = [
  process.env.RPC_URL,
  "https://dream-rpc.somnia.network/",
  "https://api.infra.testnet.somnia.network/",
].filter((url, index, urls) => url && urls.indexOf(url) === index);

const client = createPublicClient({
  transport: fallback(RPCS.map((url) => http(url, { timeout: 8_000 })), { rank: false, retryCount: 1 }),
});

const vaultAbi = parseAbi([
  "function nextPositionId() view returns (uint256)",
  "function finalizedSubId() view returns (uint256)",
  "function createdSubId() view returns (uint256)",
  "function positions(uint256) view returns (address user, bytes32 asset, bool up, uint256 principal, uint256 bankroll, uint256 atRisk, uint256 quantity, uint32 rolls, uint32 losses, bool active, (uint32 maxRolls,uint32 maxLosses,uint64 takeProfitBps,uint32 sizeBps,uint64 maxPriceWad,bool compound) policy)",
]);
const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

const ok = (message) => console.log(`PASS  ${message}`);
const warn = (message) => console.log(`WARN  ${message}`);
let failures = 0;
const fail = (message) => {
  failures += 1;
  console.log(`FAIL  ${message}`);
};

async function checkKeeper() {
  try {
    const response = await fetch(KEEPER_HEALTH_URL, { signal: AbortSignal.timeout(3_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const health = await response.json();
    if (health.state !== "healthy") throw new Error(`state is ${health.state ?? "unknown"}`);
    if (health.vault?.toLowerCase() !== VAULT.toLowerCase()) {
      throw new Error(`driving unexpected vault ${health.vault ?? "unknown"}`);
    }
    const lastTick = Date.parse(health.lastSuccessfulTick);
    const ageSeconds = Number.isFinite(lastTick) ? Math.round((Date.now() - lastTick) / 1_000) : Infinity;
    if (ageSeconds > 180) throw new Error(`last successful tick was ${ageSeconds}s ago`);
    ok(`keeper healthy; last successful tick ${ageSeconds}s ago (${health.signer})`);
    if (health.lastTransaction) console.log(`INFO  keeper last tx ${health.lastTransaction}`);
  } catch (error) {
    fail(`keeper health unavailable at ${KEEPER_HEALTH_URL}: ${error.message}`);
  }
}

async function main() {
  console.log("AutoRoll showcase preflight\n");
  const head = await client.getBlockNumber();
  ok(`Shannon RPC reached at block ${head}`);

  const code = await client.getCode({ address: VAULT });
  if (!code || code === "0x") throw new Error(`No contract code at ${VAULT}`);
  ok(`vault deployed (${(code.length - 2) / 2} runtime bytes)`);

  const [nextId, finalizedSubId, createdSubId, nativeBalance, collateralBalance] = await Promise.all([
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: "nextPositionId" }),
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: "finalizedSubId" }),
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: "createdSubId" }),
    client.getBalance({ address: VAULT }),
    client.readContract({ address: COLLATERAL, abi: erc20Abi, functionName: "balanceOf", args: [VAULT] }),
  ]);

  console.log(`INFO  vault ${VAULT}`);
  console.log(`INFO  native balance ${formatEther(nativeBalance)} STT`);
  console.log(`INFO  collateral balance ${formatUnits(collateralBalance, 6)} tUSDC`);
  const reactivityActive = finalizedSubId > 0n && createdSubId > 0n;
  if (reactivityActive) ok("Somnia Reactivity subscriptions are active");
  else {
    warn("Reactivity is not subscribed; verifying the mandatory live keeper");
    await checkKeeper();
  }

  const active = [];
  for (let id = 1n; id < nextId; id++) {
    const p = await client.readContract({ address: VAULT, abi: vaultAbi, functionName: "positions", args: [id] });
    const [user, , up, principal, bankroll, atRisk, , rolls, losses, isActive] = p;
    console.log(
      `INFO  #${id} ${isActive ? "ACTIVE" : "closed"} ${up ? "UP" : "DOWN"} ` +
      `principal=${formatUnits(principal, 6)} bankroll=${formatUnits(bankroll, 6)} ` +
      `atRisk=${formatUnits(atRisk, 6)} rolls=${rolls} losses=${losses} owner=${user}`,
    );
    if (isActive) active.push({ id, user, rolls, atRisk });
  }

  if (active.length === 0) fail("no active position is available for the live walkthrough");
  else {
    ok(`${active.length} active position${active.length === 1 ? "" : "s"} available`);
    const demonstrated = active.find((p) => p.rolls > 0 || p.atRisk > 0n);
    if (demonstrated) ok(`position #${demonstrated.id} contains live or completed-roll evidence`);
    else warn("active positions have no fills yet; warm one up with the live keeper before presenting");
    const owner = (demonstrated ?? active[0]).user;
    console.log(`INFO  watch path /app/portfolio?watch=${owner}`);
  }

  const fromBlock = head > 900n ? head - 900n : 0n;
  const logs = await client.getLogs({ address: MODULE, fromBlock, toBlock: head });
  if (logs.length > 0) ok(`${logs.length} DreamDEX module events found in the recent 900-block window`);
  else warn("no recent DreamDEX module events found; the landing activity may be quiet");

  if (failures > 0) {
    console.log(`\nPreflight failed with ${failures} blocking check${failures === 1 ? "" : "s"}.`);
    process.exitCode = 1;
  } else {
    console.log("\nPreflight complete. Resolve every WARN that affects the walkthrough before screen sharing.");
  }
}

main().catch((error) => {
  console.error(`FAIL  ${error.shortMessage ?? error.message}`);
  process.exitCode = 1;
});
