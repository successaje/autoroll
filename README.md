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
| 9 | The vault works against the **real** deployed module | 7 fork tests pass against live Shannon — custody, `openPosition`, keeper no-ops, owner-only close, the 32-token revert, empty curve |
| 10 | The wallet read path decodes a real vault | Deployed to an anvil fork, seeded, and `readPositions` / `readBalance` / `readHistory` returned correct values through the app's own modules |

```bash
forge test --root contracts --fork-url https://api.infra.testnet.somnia.network/
```

Not yet verified: the injected-wallet handshake itself (`eth_requestAccounts`,
`wallet_addEthereumChain`, and the two signatures). That needs a browser
extension driving a funded key, so it is the one part of the wallet path that has
been written but not exercised.

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

### Two modes, one UI

Set `VITE_VAULT_ADDRESS` and the app drives a deployed vault from the user's
wallet: connect (it adds Shannon if the wallet doesn't know it), approve once,
sign `openPosition` once, and then read positions, equity and the bankroll curve
straight off chain. Leave it unset and the same screens drive the off-chain
roller instead — which is how the demo runs before the vault is deployed.

The wallet surface is deliberately tiny: a direct EIP-1193 binding, no connector
library, no modal. The product's whole claim is that you sign once and walk away,
so the wallet should be the least interesting part of it. The allowance is checked
before approving, so a returning user signs once rather than twice.

## Reactivity is the fast path, not the only path

A subscription needs 32 STT, which is a real gate on a faucet. So the vault also
exposes `pokeFinalized(marketId)` and `pokeCreated(marketId, asset)` —
permissionless entries that drive **exactly the same internals** as the reactive
handler from an ordinary transaction.

That means the vault is fully functional before it is ever subscribed, and after
it is subscribed they stay useful as the backstop for a handler that ran out of
gas or lost its queue slot. Both are cheap no-ops on a market the vault holds no
position in, which matters because a keeper sweeping the venue calls them
constantly.

## The end-to-end roll test

`test/AutoRollVault.roll.t.sol` drives a roll all the way through against a real
dreamDEX window — real module, real CLOB, real ERC-6909 singleton, a real resting
book that we cross for a real fill. Nothing is mocked. The fork is **pinned** to a
block where the fixture window is still Trading with liquidity at its best ask;
without the pin it would have expired long before anyone ran it.

Resolution goes through `voidExpired()` rather than the oracle. A fork cannot
advance the oracle's off-chain answer, but `voidExpired` is a real permissionless
protocol path and it pays both sides 0.5, so redemption, accounting and the
requeue are all exercised for real:

```
filled  quantity: 30769000     (30.769 contracts)
        spent   : 16522953     (16.52 tUSDC — the IOC partly filled)
redeemed:         15384500     (half a contract each, voided)
bankroll:         98861547
```

Note `spent` is under the 20 tUSDC the policy asked for: the IOC filled what the
book had and the position was charged what it actually cost, which is the whole
point of that fix.

`scripts/find-fixture.ts` regenerates the pin when the fixture ages out.

### Both sides, and why that needed its own suite

Everything on a binary book is quoted in **YES terms**, so a Down buy at
probability `q` is an *ask* at `one - q` — it crosses the **bids**, the opposite
book from an Up buy. That inversion is the easiest place in the whole contract to
be quietly wrong, because a wrong-side implementation still fills; it just fills
at the wrong price.

The pinned fixture makes that visible rather than a matter of trust. Its bids top
out at 0.508 and its asks start at 0.537, so the two sides are separated by a
real spread:

```
up   quantity 30769000   spent 16522953   per unit 537000   (crossed the ask)
down quantity 30769000   spent 15138348   per unit 492000   (crossed the bid, 1 - 0.508)
```

If the inversion were dropped, `per unit` for Down would come back 537000. The
suite asserts the exact figure, that the tokens land under `noId` and that `yesId`
is left at zero, and that both legs can fill out of a single `pokeCreated` with
each holding its own side.

Sizing is deliberately conservative on both sides: quantity is computed against
the *limit* price, not the expected fill, so an improved fill spends less than the
policy allowed and the change stays in the bankroll. It never overspends.

### Four more defects it caught immediately

Writing this test found four things that eleven passing custody tests had not,
because none of them ever placed an order:

**The wrong function.** The vault called the spot book's
`placeOrder(bool isBid, …)`. Binary pools use **`placeBinaryOrder`**, where the
YES/NO side is an explicit `OrderKind` enum (0 BUY_YES, 2 BUY_NO) and `price` is
always in YES terms. A NO buy at probability `p` is a price of `one - p` — a
detail no amount of reading the state machine would have surfaced.

**No grid snapping.** Every order reverted `InvalidQuantity(30703694, 1000)`.
Prices must land on the tick grid and sizes on the lot grid, read per pool from
`getOrderBookParameters()`. `_quote` now snaps a YES limit *down* and a NO limit
*up* — in both cases the direction that can only lower what we pay.

**An unfilled IOC reverts.** `ImmediateOrCancelNoFill()` is not a quiet zero
return. Unhandled, it would revert the entire reactive handler and burn the
vault's gas on every window it happened to miss. It is now caught, and a missed
window leaves the position queued rather than counting as anything.

**No operator grant.** `module.redeem` pulls the holder's winning tokens off the
ERC-6909 singleton, which needs the module approved as an operator. Without it
every harvest reverted `InsufficientPermission()` — inside the reactive handler,
where nobody would have seen it. Granted once in the constructor.

## Four fund-loss defects, and what they were

Found by auditing the vault after the off-chain path was working. All four are
fixed with regression tests; they are recorded here because each one is a trap
that this venue's shape makes easy to walk into.

**Redeeming a shared balance.** `_harvest` read
`outcomeToken.balanceOf(vault, yesId)` — the vault's *total* holding for that
outcome across every position in the window. The first position in the array
redeemed everything and the rest were recorded as losses. Outcome tokens are an
ERC-6909 singleton keyed by outcome, not by holder, so a per-position `quantity`
is the only correct source. Fixed by measuring the real fill at entry and
redeeming exactly that.

**Truncating the queue.** Both loops cap at `MAX_ROLLS_PER_EVENT` and then used
to `delete` the whole queue, so every position past the 16th vanished — still
active, funds still in the vault, nothing left pointing at them. The queues now
compact instead, keeping the untouched tail for the next (permissionless,
idempotent) poke.

**Booking an unfilled order as a wipe.** A resting limit order that never fills
leaves escrow in the pool that the vault cannot attribute back to one position
when the window expires, so the roll settled as a total loss while the money sat
elsewhere. Entry is now **IOC**: it either fills immediately or commits nothing,
and the position charges what was actually spent rather than the requested stake.

**Stranding a position closed between windows.** `closePosition` set
`maxRolls = rolls` and waited for a harvest — but a position sitting in the
pending queue is committed to no market, so nothing would ever finalize and the
bankroll was locked forever. It now pays out on the spot when `atRisk == 0`.

## Somnia's log window is 100 seconds

The bankroll curve was originally read from `PositionSettled` logs, which is what
you would do on any other chain. It does not work here: Somnia caps
`eth_getLogs` at **1000 blocks**, and at 100ms blocks that is 100 seconds of
history. A position rolling for an hour sits 36,000 blocks deep, so log-backed
history would need dozens of paged requests and the count would keep growing.

The vault keeps a **bounded 32-point ring** of `bankroll << 1 | won` instead —
one SSTORE per roll, never grows, and `curveOf(id)` answers the whole chart in a
single `eth_call`. `PositionSettled` is still emitted for indexers.

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
