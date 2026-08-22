/**
 *  AutoRoll — off-chain roller.
 *
 *  Same state machine as `AutoRollVault`, driven from the Bot Kit surface instead
 *  of a reactivity subscription. It exists for two reasons:
 *
 *   1. It runs today, without the 32 STT the on-chain vault needs to subscribe.
 *   2. It is the honest baseline the vault is measured against — same policy, same
 *      stop conditions, but a polling loop instead of an in-block callback.
 *
 *  Usage:
 *    npx tsx src/roller.ts --open BTC:up:25 --cadence 60          # dry run
 *    npx tsx src/roller.ts --open ETH:down:10 --streak --live     # signs + trades
 */
import {
  ORDER_TYPE,
  quoteBinaryStakeOverBook,
  type BinaryBuySide,
} from "@somnia-chain/markets-sdk";
import { makeExchange } from "./exchange.js";
import { liveWindows, type Window } from "./windows.js";
import {
  DEFAULT_POLICY,
  STREAK_POLICY,
  nextStake,
  stopReason,
  type Policy,
  type Position,
} from "./policy.js";
import { load, save } from "./state.js";

const TICK_MS = 2_000;

export interface RollerOpts {
  /** Sign and send. Otherwise every write is logged and the fill is simulated. */
  live: boolean;
  /** Which series cadence to roll on, in seconds (60 = the fast BTC/ETH feed). */
  cadenceSec: number;
  /** CLI mode stops once nothing is active; the UI server keeps the loop alive. */
  exitWhenIdle?: boolean;
}

export type RollerEvent =
  | { kind: "opened"; id: number }
  | { kind: "entered"; id: number; marketId: string; price: number; symbol: string; secondsLeft: number }
  | { kind: "rolled"; id: number; won: boolean; voided: boolean; staked: string; returned: string; bankroll: string }
  | { kind: "closed"; id: number; reason: string }
  | { kind: "note"; id: number; text: string };

export class Roller {
  private positions: Position[];
  private listeners = new Set<(e: RollerEvent) => void>();

  constructor(
    private readonly ex: ReturnType<typeof makeExchange>,
    private readonly account: `0x${string}` | null,
    private readonly opts: RollerOpts,
  ) {
    this.positions = load();
  }

  /** Subscribe to state transitions — the UI's feed. Returns an unsubscribe fn. */
  subscribe(fn: (e: RollerEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: RollerEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  getPositions(): Position[] {
    return this.positions;
  }

  /** Stop rolling. Anything already exposed to a live window rides that window out. */
  requestClose(id: number): boolean {
    const p = this.positions.find((x) => x.id === id && x.active);
    if (!p) return false;
    p.policy.maxRolls = p.rolls || 1; // stop at the next harvest
    if (!p.marketId) {
      p.active = false;
      this.emit({ kind: "closed", id: p.id, reason: "user-stop" });
    }
    save(this.positions);
    return true;
  }

  open(asset: string, up: boolean, stakeHuman: number, decimals: number, policy: Policy): Position {
    const principal = BigInt(Math.round(stakeHuman * 10 ** decimals));
    const p: Position = {
      id: (this.positions.at(-1)?.id ?? 0) + 1,
      asset,
      up,
      principal,
      bankroll: principal,
      atRisk: 0n,
      rolls: 0,
      losses: 0,
      active: true,
      policy,
      marketId: null,
      quantity: 0n,
      history: [],
    };
    this.positions.push(p);
    save(this.positions);
    log(`opened #${p.id}  ${asset} ${up ? "UP" : "DOWN"}  bankroll ${fmt(principal, decimals)}`);
    this.emit({ kind: "opened", id: p.id });
    return p;
  }

  async run(): Promise<void> {
    log(`roller up — ${this.opts.live ? "LIVE" : "DRY RUN"}, ${this.opts.cadenceSec}s cadence`);
    for (;;) {
      try {
        const windows = await liveWindows(this.ex);
        await this.harvest();
        await this.enter(windows);
        save(this.positions);
      } catch (err) {
        // A reverted write throws a decoded error from markets-sdk 0.23.0 up
        // (gotcha #2). Never let one bad window kill the loop.
        log(`tick error: ${(err as Error).message}`);
      }
      if (!this.positions.some((p) => p.active) && this.opts.exitWhenIdle) {
        log("no active positions — done");
        return;
      }
      await sleep(TICK_MS);
    }
  }

  // ------------------------------------------------------------------ harvest

  /** Mirrors `AutoRollVault._harvest`: settle every finished window, apply the
   *  policy, and either pay out or hand the position back to the pending queue. */
  private async harvest(): Promise<void> {
    const exposed = this.positions.filter((p) => p.active && p.marketId);
    if (exposed.length === 0) return;

    // Gotcha #10: a settled market drops out of loadMarkets(), so the on-chain
    // record is the only place left to ask.
    for (const p of exposed) {
      const onchain = await this.ex.client.getMarketOnchain(p.marketId!);
      const terminal = onchain.status === 4 || onchain.status === 5;
      if (!terminal) continue;

      const voided = onchain.status === 5;
      const won = !voided && onchain.winningOutcome === (p.up ? 0 : 1);

      let payout: bigint;
      if (this.opts.live) {
        // Gotcha #11: a losing redemption pays 0 and does NOT revert, so the
        // payout is read from what actually came back, never inferred.
        const claimable = await this.ex.client.getClaimable(this.account!);
        const mine = claimable.find(
          (c) => c.marketId.toLowerCase() === p.marketId!.toLowerCase(),
        );
        if (mine) {
          await this.ex.trader.redeemMany({
            entries: [{ marketId: mine.marketId as `0x${string}`, outcomeIdx: mine.outcomeIdx, amount: mine.amount }],
          });
          payout = mine.estPayout;
        } else {
          payout = 0n; // loser side: nothing to claim
        }
      } else {
        payout = voided ? p.quantity / 2n : won ? p.quantity : 0n;
      }

      // The stake left the bankroll when the order was placed; whatever the
      // window returns comes back in. A loss costs the stake, not the position.
      const staked = p.atRisk;
      p.bankroll += payout;
      p.losses = payout < staked ? p.losses + 1 : 0;
      p.rolls += 1;
      p.history.push({
        marketId: p.marketId!,
        staked: staked.toString(),
        returned: payout.toString(),
        bankroll: p.bankroll.toString(),
        won,
      });

      const d = onchain.decimals;
      log(
        `#${p.id} roll ${p.rolls}  ${voided ? "VOID" : won ? "WON " : "LOST"}  ` +
          `staked ${fmt(staked, d)} → ${fmt(payout, d)}  ` +
          `bankroll ${fmt(p.bankroll, d)}  (${p.rolls - p.losses}/${p.rolls} won)`,
      );

      this.emit({
        kind: "rolled",
        id: p.id,
        won,
        voided,
        staked: staked.toString(),
        returned: payout.toString(),
        bankroll: p.bankroll.toString(),
      });

      p.marketId = null;
      p.quantity = 0n;
      p.atRisk = 0n;

      const stop = stopReason(p);
      if (stop) {
        p.active = false;
        log(`#${p.id} CLOSED (${stop}) — ${fmt(p.principal, d)} in, ${fmt(p.bankroll, d)} out`);
        this.emit({ kind: "closed", id: p.id, reason: stop });
      }
    }
  }

  // -------------------------------------------------------------------- enter

  /** Mirrors `AutoRollVault._enter`: put every pending position into the freshest
   *  window on its asset and cadence. */
  private async enter(windows: Window[]): Promise<void> {
    const pending = this.positions.filter((p) => p.active && !p.marketId);
    if (pending.length === 0) return;

    for (const p of pending) {
      // Prefer the window with the most headroom on the requested cadence, so a
      // roll never lands on a series about to lock (gotcha #9).
      const w = windows
        .filter((x) => x.asset === p.asset && x.intervalSec === this.opts.cadenceSec)
        .sort((a, b) => b.secondsLeft - a.secondsLeft)[0];
      if (!w) continue;

      const stake = nextStake(p);
      if (stake === 0n) continue;

      const side: BinaryBuySide = p.up ? "BUY_YES" : "BUY_NO";
      const book = await this.ex.client.getBinaryOrderBook(w.pool, { depth: 10 });
      const oneCollateral = 10n ** BigInt(w.decimals);

      // Snaps the limit to the tick grid and the size to the lot grid for us —
      // gotcha #3 (a float price is off-grid and reverts) and #6 (sub-lot sizes
      // floor to zero) are both handled here rather than by hand.
      const quote = quoteBinaryStakeOverBook(book, side, stake, oneCollateral, {
        tickSize: w.tickSize,
        lotSize: w.lotSize,
        minQuantity: w.minQuantity,
      });
      if (!quote) {
        log(`#${p.id} no fillable size on ${w.symbolUp} — waiting for the next window`);
        this.emit({ kind: "note", id: p.id, text: `no fillable size on ${w.asset} — waiting` });
        continue;
      }

      const priceHuman = Number(quote.limitPrice) / Number(oneCollateral);
      if (priceHuman > p.policy.maxPrice) {
        log(`#${p.id} skip ${w.asset} @ ${priceHuman.toFixed(3)} — over maxPrice ${p.policy.maxPrice}`);
        this.emit({
          kind: "note",
          id: p.id,
          text: `${w.asset} at ${priceHuman.toFixed(3)} is over your ${p.policy.maxPrice} limit — skipped`,
        });
        continue;
      }

      if (this.opts.live) {
        await this.ex.trader.placeOrder({
          pool: w.pool,
          side,
          price: quote.yesPrice,
          quantity: quote.quantity,
          orderType: ORDER_TYPE.MARKET, // IOC — never rest silently (gotcha #4)
          // expireTimestampNs defaults to the pool's own market expiry, which is
          // exactly the dead-man's switch we want (gotcha #5).
        });
      }

      p.marketId = w.marketId;
      p.quantity = quote.quantity;
      p.atRisk = stake;
      p.bankroll -= stake;
      log(
        `#${p.id} entered ${w.symbolUp.split("/")[0]} ${p.up ? "UP" : "DOWN"} ` +
          `@ ${priceHuman.toFixed(3)}  staking ${fmt(stake, w.decimals)}  ` +
          `(${w.secondsLeft.toFixed(0)}s to expiry)`,
      );
      this.emit({
        kind: "entered",
        id: p.id,
        marketId: w.marketId,
        price: priceHuman,
        symbol: w.symbolUp.split("/")[0],
        secondsLeft: w.secondsLeft,
      });
    }
  }
}

// ---------------------------------------------------------------------- utils

const fmt = (v: bigint, d: number) => (Number(v) / 10 ** d).toFixed(3);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (m: string) => console.log(`${new Date().toISOString().slice(11, 19)}  ${m}`);

// ----------------------------------------------------------------------- main

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const flag = (n: string) => argv.includes(`--${n}`);
  const val = (n: string) => argv[argv.indexOf(`--${n}`) + 1];

  const live = flag("live");
  const cadenceSec = Number(val("cadence") ?? 60);
  const policy: Policy = flag("streak") ? STREAK_POLICY : DEFAULT_POLICY;

  const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (live && !pk) {
    console.error("--live needs PRIVATE_KEY in the environment");
    process.exit(1);
  }

  const ex = makeExchange(live ? pk : undefined);
  const account = live ? ((await ex.trader) as any).account?.address ?? null : null;
  const roller = new Roller(ex, account, { live, cadenceSec, exitWhenIdle: true });

  if (flag("open")) {
    const [asset, dir, size] = String(val("open")).split(":");
    roller.open(asset.toUpperCase(), dir.toLowerCase() === "up", Number(size), 6, policy);
  }

  await roller.run();
  process.exit(0);
}
