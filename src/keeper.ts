/**
 *  AutoRoll keeper — reactivity, polled.
 *
 *  A subscribed vault is driven by the chain itself: validators call `_onEvent`
 *  the moment a window finalizes. That needs 32 STT sitting in the vault. Until
 *  it does, or whenever a handler runs out of gas or loses its queue slot, the
 *  same work has to come from somewhere.
 *
 *  This is that somewhere. It watches the exact two module events the
 *  subscription filters on and calls the vault's permissionless `poke*` entries,
 *  which run the identical internals. Deliberately RPC-only: no indexer, no SDK,
 *  no market list — the keeper should depend on nothing the reactive path does
 *  not, so the two can never drift.
 *
 *    npx tsx src/keeper.ts --vault 0x…            # dry run: logs what it would send
 *    PRIVATE_KEY=0x… npx tsx src/keeper.ts --vault 0x… --live
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { NET, BINARY_MODULE, TOPIC_MARKET_CREATED, TOPIC_MARKET_FINALIZED } from "./config.js";

/** Somnia caps eth_getLogs at 1000 blocks — 100 seconds at 100ms blocks. */
const MAX_LOG_SPAN = 999n;
const TICK_MS = 2_000;
/** Comfortably above the vault's MIN_ORDER_GAS × MAX_ROLLS_PER_EVENT. */
const POKE_GAS = 30_000_000n;
/** Recover finalizations emitted during an ordinary hosted restart. Created
 * events are deliberately not replayed: bidding into hundreds of expired
 * windows would waste gas, while a pending position can simply await the next. */
const DEFAULT_RECOVERY_BLOCKS = 10_000n;

const vaultAbi = parseAbi([
  "function pokeCreated(bytes32 marketId, bytes32 asset)",
  "function pokeFinalized(bytes32 marketId)",
  "function pendingCount(bytes32 asset) view returns (uint256)",
  "function inMarketCount(bytes32 marketId) view returns (uint256)",
  "function nextPositionId() view returns (uint256)",
  "function positions(uint256) view returns (address user, bytes32 asset, bool up, uint256 principal, uint256 bankroll, uint256 atRisk, uint256 quantity, uint32 rolls, uint32 losses, bool active, (uint32,uint32,uint64,uint32,uint64,bool) policy)",
]);

export interface KeeperOpts {
  vault: Address;
  live: boolean;
  privateKey?: Hex;
  /** Point every read and write somewhere else — a fork, for testing. */
  rpcUrl?: string;
  /** Start scanning here instead of at the head. Replays history on a fork. */
  fromBlock?: bigint;
  /** Stop after one pass. Used by the verification script. */
  once?: boolean;
  /** Log every module event seen, not just the ones that mean work. */
  verbose?: boolean;
  /** How far back to recover missed finalizations after a restart. */
  recoveryBlocks?: bigint;
}

export interface KeeperStatus {
  state: "starting" | "healthy" | "degraded";
  vault: Address;
  signer: Address | null;
  head: string | null;
  lastSuccessfulTick: string | null;
  lastTransaction: Hex | null;
  lastError: string | null;
}

/** keccak("PositionRolled(uint256,bytes32,uint256,uint32)") — topic2 names the
 *  market a position entered, which is the only on-chain link from a position
 *  back to its window. */
/** The explorer's log index is not bounded by the RPC's ~1000-block window,
 *  which is the only way to find a market a position entered days ago. */
const EXPLORER_API = "https://shannon-explorer.somnia.network/api/v2";
const TOPIC_POSITION_ROLLED =
  "0x85577a2f7c799f990d3cd76faa231656fda00599178083bfda685f816b6afe0e";
/** How often to check the vault's actual state rather than the event stream. */
const RECONCILE_MS = 10 * 60_000;

export class Keeper {
  private readonly publicClient;
  private lastReconcile = 0;
  private readonly wallet;
  private cursor: bigint | null = null;
  private lastSuccessfulTick: Date | null = null;
  private lastTransaction: Hex | null = null;
  private lastError: string | null = null;

  constructor(private readonly opts: KeeperOpts) {
    const url = opts.rpcUrl ?? NET.httpRpcUrl;
    this.publicClient = createPublicClient({ chain: NET.chain, transport: http(url) });
    this.wallet =
      opts.live && opts.privateKey
        ? createWalletClient({
            account: privateKeyToAccount(opts.privateKey),
            chain: NET.chain,
            transport: http(url),
          })
        : null;
  }

  async run(): Promise<void> {
    const head = await this.publicClient.getBlockNumber();
    if (this.opts.fromBlock !== undefined) {
      this.cursor = this.opts.fromBlock - 1n;
    } else {
      const recovery = this.opts.recoveryBlocks ?? DEFAULT_RECOVERY_BLOCKS;
      const from = head > recovery ? head - recovery : 0n;
      log(`recovering missed finalizations from blocks ${from}–${head}`);
      await this.recoverFinalizations(from, head);
      this.cursor = head;
    }
    log(
      `keeper up — vault ${this.opts.vault}, ${this.wallet ? `signing as ${this.wallet.account.address}` : "DRY RUN"}`,
    );

    for (;;) {
      try {
        await this.tick();
        if (Date.now() - this.lastReconcile > RECONCILE_MS) {
          this.lastReconcile = Date.now();
          await this.reconcile();
        }
        this.lastSuccessfulTick = new Date();
        this.lastError = null;
      } catch (err) {
        this.lastError = (err as Error).message;
        log(`tick error: ${this.lastError}`);
      }
      if (this.opts.once) return;
      await sleep(TICK_MS);
    }
  }

  status(): KeeperStatus {
    const age = this.lastSuccessfulTick ? Date.now() - this.lastSuccessfulTick.getTime() : Infinity;
    return {
      state: !this.lastSuccessfulTick ? "starting" : age <= 30_000 && !this.lastError ? "healthy" : "degraded",
      vault: this.opts.vault,
      signer: this.wallet?.account.address ?? null,
      head: this.cursor?.toString() ?? null,
      lastSuccessfulTick: this.lastSuccessfulTick?.toISOString() ?? null,
      lastTransaction: this.lastTransaction,
      lastError: this.lastError,
    };
  }

  /**
   *  Settle anything the event stream missed.
   *
   *  The keeper is otherwise purely event-driven with a bounded startup
   *  lookback, which has one fatal shape: if it is down when a market it holds
   *  finalizes, it never witnesses that event, and no later scan reaches back
   *  far enough to find it. A position is then stranded in a settled window
   *  forever while the keeper sits there looking perfectly healthy.
   *
   *  That is not hypothetical — it is how position #11 sat exposed for eleven
   *  days with the keeper running and watching the whole time.
   *
   *  So this asks the vault what it is actually in, rather than trusting that
   *  every relevant event was seen. Cheap: one read, plus one lookup per
   *  exposed position, every ten minutes.
   */
  private async reconcile(): Promise<void> {
    const next = (await this.publicClient.readContract({
      address: this.opts.vault,
      abi: vaultAbi,
      functionName: "nextPositionId",
    })) as bigint;

    for (let id = 1n; id < next; id++) {
      const p = (await this.publicClient.readContract({
        address: this.opts.vault,
        abi: vaultAbi,
        functionName: "positions",
        args: [id],
      })) as readonly unknown[];

      const atRisk = p[5] as bigint;
      const active = p[9] as boolean;
      if (!active || atRisk === 0n) continue; // queued positions are the event loop's job

      const marketId = await this.marketOf(id);
      if (!marketId) continue;

      const stillIn = (await this.publicClient.readContract({
        address: this.opts.vault,
        abi: vaultAbi,
        functionName: "inMarketCount",
        args: [marketId],
      })) as bigint;
      if (stillIn === 0n) continue;

      log(`reconcile: position #${id} stranded in ${short(marketId)} — settling`);
      await this.send("pokeFinalized", [marketId], `harvest ${short(marketId)} (reconcile)`);
    }
  }

  /**
   *  The market a position is exposed to, from its own last PositionRolled log.
   *
   *  The vault maps market → positions and not the reverse, and `eth_getLogs`
   *  here reaches back about 100 seconds, so this uses the explorer index. If
   *  the explorer is unreachable the position is left alone and retried on the
   *  next pass — never guessed at.
   */
  private async marketOf(positionId: bigint): Promise<Hex | null> {
    const idTopic = `0x${positionId.toString(16).padStart(64, "0")}`;
    let params = "";
    for (let page = 0; page < 6; page++) {
      const res = await fetch(`${EXPLORER_API}/addresses/${this.opts.vault}/logs${params}`);
      if (!res.ok) return null;
      const body = (await res.json()) as {
        items?: Array<{ topics?: (string | null)[] }>;
        next_page_params?: Record<string, string>;
      };
      for (const item of body.items ?? []) {
        const [t0, t1, t2] = item.topics ?? [];
        if (t0?.toLowerCase() === TOPIC_POSITION_ROLLED && t1?.toLowerCase() === idTopic && t2) {
          return t2 as Hex;
        }
      }
      if (!body.next_page_params) return null;
      params = "?" + new URLSearchParams(body.next_page_params).toString();
    }
    return null;
  }

  private async recoverFinalizations(fromBlock: bigint, toBlock: bigint): Promise<void> {
    let from = fromBlock;
    while (from <= toBlock) {
      const to = from + MAX_LOG_SPAN - 1n > toBlock ? toBlock : from + MAX_LOG_SPAN - 1n;
      const logs = await this.publicClient.getLogs({ address: BINARY_MODULE, fromBlock: from, toBlock: to });
      for (const entry of logs) {
        const [topic0, marketId] = entry.topics as [Hex, Hex | undefined];
        if (topic0 === TOPIC_MARKET_FINALIZED && marketId) await this.onFinalized(marketId);
      }
      from = to + 1n;
    }
  }

  private async tick(): Promise<void> {
    const head = await this.publicClient.getBlockNumber();
    if (this.cursor === null || head <= this.cursor) return;

    // Chunked, because falling more than 1000 blocks behind is a 100-second
    // hiccup and the node refuses the range outright rather than truncating it.
    let from = this.cursor + 1n;
    while (from <= head) {
      const to = from + MAX_LOG_SPAN - 1n > head ? head : from + MAX_LOG_SPAN - 1n;
      await this.scan(from, to);
      from = to + 1n;
    }
    this.cursor = head;
  }

  private async scan(fromBlock: bigint, toBlock: bigint): Promise<void> {
    const logs = await this.publicClient.getLogs({
      address: BINARY_MODULE,
      fromBlock,
      toBlock,
    });

    for (const l of logs) {
      const [topic0, marketId] = l.topics as [Hex, Hex | undefined];
      if (!marketId) continue;

      if (topic0 === TOPIC_MARKET_FINALIZED) {
        if (this.opts.verbose) log(`  saw MarketFinalized  ${short(marketId)}`);
        await this.onFinalized(marketId);
      } else if (topic0 === TOPIC_MARKET_CREATED) {
        const asset = decodeAsset(l.data);
        if (this.opts.verbose) {
          log(`  saw MarketCreated    ${short(marketId)}  asset=${asset ? short(asset) : "UNDECODABLE"}`);
        }
        await this.onCreated(marketId, asset);
      }
    }
  }

  /** Harvest, but only if the vault is actually exposed to this window. */
  private async onFinalized(marketId: Hex): Promise<void> {
    const exposed = await this.publicClient.readContract({
      address: this.opts.vault,
      abi: vaultAbi,
      functionName: "inMarketCount",
      args: [marketId],
    });
    if (exposed === 0n) return; // the overwhelmingly common case
    await this.send("pokeFinalized", [marketId], `harvest ${short(marketId)} (${exposed} position(s))`);
  }

  /** Enter, but only if somebody is queued on this asset. */
  private async onCreated(marketId: Hex, asset: Hex | null): Promise<void> {
    if (!asset) return;
    const pending = await this.publicClient.readContract({
      address: this.opts.vault,
      abi: vaultAbi,
      functionName: "pendingCount",
      args: [asset],
    });
    if (pending === 0n) return;
    await this.send(
      "pokeCreated",
      [marketId, asset],
      `enter ${short(marketId)} (${pending} pending)`,
    );
  }

  private async send(
    functionName: "pokeCreated" | "pokeFinalized",
    args: readonly unknown[],
    what: string,
  ): Promise<void> {
    if (!this.wallet) {
      log(`would ${what}`);
      return;
    }
    try {
      const hash = await this.wallet.writeContract({
        address: this.opts.vault,
        abi: vaultAbi,
        functionName,
        args: args as never,
        // Explicit, never estimated. The vault catches order failures so it can
        // keep serving other positions, which means a too-low budget does not
        // revert — it just skips the roll. `eth_estimateGas` binary-searches for
        // "does not revert" and therefore settles on a budget where every order
        // quietly fails. A fixed generous limit is the only safe answer.
        gas: POKE_GAS,
      });
      await this.publicClient.waitForTransactionReceipt({ hash });
      this.lastTransaction = hash;
      log(`${what} — ${hash}`);
    } catch (err) {
      // A poke is best-effort by design: it is idempotent, and the next window's
      // event brings the same work back around. Never let one kill the loop.
      log(`${what} FAILED: ${(err as Error).message.split("\n")[0]}`);
    }
  }
}

/** A tiny operational surface for hosted health checks. It exposes no secrets
 * and performs no actions; it only proves that the event loop is advancing. */
export function serveHealth(keeper: Keeper, port: number) {
  return createServer((req, res) => {
    if (req.url !== "/health") {
      res.writeHead(404).end("not found");
      return;
    }
    const status = keeper.status();
    res.writeHead(status.state === "healthy" ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify(status));
  }).listen(port, "0.0.0.0", () => log(`health server listening on :${port}/health`));
}

/**
 *  `asset` is word 13 of MarketCreated's non-indexed tail — the same hand-rolled
 *  offset read the vault does, and for the same reason: it is a typed field, and
 *  the question text has been reworded more than once (gotcha #13).
 */
export function decodeAsset(data: Hex): Hex | null {
  const body = data.slice(2);
  const word = (i: number) => body.slice(i * 64, (i + 1) * 64);
  if (body.length < 14 * 64) return null;
  const off = Number(BigInt(`0x${word(13)}`));
  if ((off + 32) * 2 > body.length) return null;
  const len = Number(BigInt(`0x${body.slice(off * 2, off * 2 + 64)}`));
  if (len === 0 || len > 32 || (off + 32 + len) * 2 > body.length) return null;
  const raw = `0x${body.slice(off * 2 + 64, off * 2 + 64 + len * 2)}` as Hex;
  return keccak256(raw);
}

/** Market ids are small sequential numbers left-padded into a bytes32, so the
 *  leading characters are all zeros and identify nothing. Show the tail. */
const short = (h: string) =>
  /^0x0{40}/.test(h) ? `#${BigInt(h).toString(16)}` : `${h.slice(0, 10)}…`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (m: string) => console.log(`${new Date().toISOString().slice(11, 19)}  ${m}`);

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const val = (n: string) => {
    const index = argv.indexOf(`--${n}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const live = argv.includes("--live");
  const verbose = argv.includes("--verbose");

  const vault = (val("vault") ?? process.env.VAULT_ADDRESS) as Address | undefined;
  if (!vault) {
    console.error("usage: tsx src/keeper.ts --vault 0x… [--live]");
    process.exit(1);
  }
  const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
  if (live && !privateKey) {
    console.error("--live needs PRIVATE_KEY in the environment");
    process.exit(1);
  }

  const recoveryBlocks = process.env.KEEPER_RECOVERY_BLOCKS
    ? BigInt(process.env.KEEPER_RECOVERY_BLOCKS)
    : undefined;
  const rpcUrl = process.env.RPC_URL ?? process.env.SHANNON_RPC;
  const keeper = new Keeper({ vault, live, privateKey, verbose, recoveryBlocks, rpcUrl });
  if (process.env.PORT) serveHealth(keeper, Number(process.env.PORT));
  await keeper.run();
}
