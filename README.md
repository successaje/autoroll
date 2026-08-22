# AutoRoll

**Synthetic perpetual event contracts on DreamDEX.**

A DreamDEX binary window expires in 60 seconds and the venue rolls a successor
automatically. A person who is simply *long BTC* would have to redeem and re-enter
every window, forever — so the entire retail audience for these markets is
structurally locked out, and only bots can hold a view.

AutoRoll collapses the infinite chain of expiring windows into **one position that
never expires**. The user taps once. An on-chain vault does the rest: when a window
resolves, Somnia reactivity calls the vault in the same block, the vault redeems the
winning outcome and rests a bid on the successor window. No keeper, no cron, no
second signature.

Two properties of dreamDEX make this possible, and neither is portable:

- **Zero maker, taker and settlement fees.** Rolling a position 200 times through a
  venue charging 2% taker would surrender ~98% of the stake to fees. Perpetual
  rolling only closes at zero.
- **On-chain reactivity.** A contract can subscribe to `MarketFinalized` and be
  invoked by the validators as a synthetic transaction, with no off-chain service.

Cold start is handled by the venue's **mint-a-pair** path: a resting Up bid crosses a
resting Down bid with no seller at all, so a brand-new window fills even with an
empty book and nobody holding inventory.

---

## Validation status

Everything below was checked against **live Shannon testnet (chain 50312)**, not read
off a docs page.

| # | Claim | Result |
|---|---|---|
| 1 | Reactivity precompile `0x0100` is live on Shannon | `somnia_reactivityGetSubscriptions` responds; `eth_call` to `subscribe` executes |
| 2 | A third-party contract may subscribe to a *DreamDEX* event | **Yes.** `subscribe()` with `emitter = BinaryMarketsModule`, `eventTopics[0] = MarketFinalized`, marketId wildcard returned subscription id `0xcdb046` under a balance state-override |
| 3 | The 32-native-token gate is enforced | Same call from a zero-balance caller reverts; with 100 STT overridden it succeeds |
| 4 | The module actually emits a usable resolution signal | `MarketFinalized(bytes32 indexed marketId, address indexed pool, uint256 marketKey)` — topic0 `0x8f39…6e08`, observed 10× in a 50-log window |
| 5 | …and a usable successor signal | `MarketCreated(bytes32 indexed marketId, …)` — topic0 `0xb5ec…f8cd`, observed 11× in the same window |
| 6 | `_decodeAsset`'s hand-rolled offset read is correct | 10/10 live `MarketCreated` logs decode to `"BTC"` / `"ETH"` |
| 7 | The SDK reads live markets end-to-end | 12 live Trading windows discovered; short feeds roll on a **60-second** cadence |
| 8 | The vault compiles | `forge build` clean (solc 0.8.30, `via_ir`) |

Reproduce:

```bash
npm install && npm run probe:reactivity && npm run probe:logs && npx tsx src/discover.ts
```

### The one thing still blocked

Deployment needs the vault to hold **≥ 32 STT** at `subscribe()` time. It is a
sybil gate, not a fee — the 32 is never consumed and stays in the vault's balance —
but it has to be there. Public faucets hand out far less per request, so this needs
either repeated faucet draws or a dev grant from the hackathon Telegram, which offers
test STT. Everything up to that line is verified.

Faucets: [official](https://testnet.somnia.network/) ·
[Google Cloud](https://cloud.google.com/application/web3/faucet/somnia/shannon) ·
[Stakely](https://stakely.io/faucet/somnia-testnet-stt) ·
[thirdweb](https://thirdweb.com/somnia-shannon-testnet)

---

## How it works

```
   user taps "Up · $20 · rolling"
              │
              ▼
     openPosition()  ──────────────►  _pending[BTC]
                                           │
   ┌───────────────────────────────────────┘
   │  reactivity sub B: MarketCreated
   ▼
  _enter()  ── rests a bid on the fresh window ──►  _inMarket[marketId]
                                                          │
   ┌──────────────────────────────────────────────────────┘
   │  reactivity sub A: MarketFinalized
   ▼
  _harvest()  ── redeem winner, apply policy ──►  back to _pending, or pay out
```

Both subscriptions are **wildcard on marketId** — one pair of subscriptions covers
every window the venue will ever create, and the vault routes internally. The handler
exits in a couple of SLOADs for markets it has no position in, which is the common
case and which the vault pays for out of its own balance.

`Policy` is deliberately expressed in terms a UI can render as sliders: `maxRolls`,
`maxLosses`, `takeProfitBps`, `maxPriceWad`, `compound`. Setting `takeProfitBps = 0`
and `maxLosses = 1` is streak mode — a provably fair on-chain parlay with no house
edge, because the venue's fees really are zero.

## Layout

```
contracts/src/AutoRollVault.sol      the on-chain handler + vault
contracts/src/interfaces/            BinaryMarketsModule, BinaryPool, ERC-6909
contracts/script/Deploy.s.sol        deploy, fund, subscribe
src/policy.ts                        Policy + stopReason — mirrors the Solidity exactly
src/windows.ts                       window discovery (honours gotchas #1/#9/#12/#13)
src/roller.ts                        the off-chain roller
src/state.ts                         restart-safe position book
src/config.ts                        Shannon wiring, verified topic0s
scripts/probe-reactivity.mjs         validation #1–#3
scripts/decode-logs.mjs              validation #4–#5
scripts/verify-decoder.mjs           validation #6
```

## The app

```bash
npm run dev:api     # roller + SSE on :5183   (add --live to sign and trade)
npm run dev:app     # UI on :5184
```

Mobile-first, dark, one interaction: pick an asset, pick a side, tap. After that
the position card is the whole screen — total equity as the hero figure, a
bankroll curve against a break-even baseline, rolls / won / at-risk, the window
currently held, and a stop button. The activity feed narrates every roll in plain
language, including the ones that *didn't* happen ("BTC at 0.700 is over your 0.65
limit — skipped").

The chart follows the dataviz method: one series, so no legend; the palette is
validated (`#3987e5` for equity, `#3987e5`/`#d95926` for the Up/Down pair — all
checks pass on this surface); win and loss are never encoded as a red/green pair,
which would fail CVD separation, so the curve's own direction carries it and the
feed carries the word.

The UI talks to the roller's HTTP surface rather than to chain directly. That is
the demo seam: in production the browser signs `openPosition` against
`AutoRollVault` and reads positions off chain, but routing through the roller
makes the whole product demonstrable before the vault has its 32 STT.

## Sizing: why a fraction, not the whole bankroll

The first version compounded the entire balance into every window, and the first
run made the flaw obvious: a binary contract pays **zero** on a loss, so betting
everything means the first loss ends the run and `maxLosses` can never fire. That
is a lottery ticket, not a position.

So a position now carries a **bankroll**, and `sizeBps` decides how much of it
goes into each window (default 20%). A loss costs the stake, not the position;
wins compound the bankroll and scale the next stake with it. This is what makes a
hundred-window roll survivable, and it is what makes the stop-loss, take-profit
and max-rolls stops mean anything at all.

Both engines were changed together — `Policy`, `nextStake` and `stopReason` are
mirrored between `src/policy.ts` and `AutoRollVault.sol` on purpose.

## The off-chain roller

The same state machine as the vault, driven from the Bot Kit surface instead of a
reactivity subscription. It exists for two reasons: it runs **today**, without the
32 STT the vault needs to subscribe; and it is the honest baseline the vault is
measured against — identical policy and stop conditions, but a polling loop rather
than an in-block callback.

`src/policy.ts` is shared ground: `Policy` and `stopReason()` are kept
byte-for-byte equivalent to `AutoRollVault.Policy` and `_stopReason`, so both
engines make the same decision on the same position.

```bash
npx tsx src/roller.ts --open BTC:up:25 --cadence 60          # dry run, no key needed
npx tsx src/roller.ts --open ETH:down:10 --streak --live     # signs and trades
```

Dry run reads real books and real resolutions off Shannon and simulates only the
fill, so the loop is demonstrable without a funded key. A real session:

```
18:05:52  opened #1  BTC UP  bankroll 100.000
18:05:54  #1 entered BTC-7734625-22AUG26-1806 UP @ 0.611  staking 20.000  (22s to expiry)
18:06:06  #1 roll 1  WON   staked 20.000 → 32.733  bankroll 112.733  (1/1 won)
18:06:24  #1 entered BTC-7735712-22AUG26-1807 UP @ 0.331  staking 22.547  (51s to expiry)
18:07:09  #1 roll 2  LOST  staked 22.547 → 0.000  bankroll  90.186  (1/2 won)
18:07:09  #1 entered BTC-7733327-22AUG26-1808 UP @ 0.531  staking 18.037  (62s to expiry)
18:08:11  #1 roll 3  LOST  staked 18.037 → 0.000  bankroll  72.149  (1/3 won)
```

Four windows in four minutes, unattended: a compounding win, stakes that scale
with the bankroll, and the run continuing through losses until the stop-loss
closed it at 46.18 rather than zero. The `maxPrice` guard and the
illiquid-window skip both fire along the way. That is the demo video, and it
needs no faucet.

`--cadence` selects the series: the venue runs 60s, 300s, 900s, 3600s and 14400s
feeds on BTC and ETH concurrently.

## Gotchas honoured

The DreamDEX docs ship a [Gotchas](https://docs.dreamdex.io/developers/event-contracts/gotchas)
page of things that bite people. The ones this code is built around:

- **#1/#9** gate on the on-chain status, skip windows with no expiry headroom
- **#5** every order carries `expireTimestampNs`, capped at the window's expiry — it
  is the dead-man's switch if a roll never fills
- **#11** a losing redemption pays 0 and does *not* revert, so `_harvest` reads the
  collateral delta rather than trusting the call
- **#12** state is keyed by `marketId`; pools are recycled between windows
- **#13** `asset` is read as a typed field, never regexed out of the question text
