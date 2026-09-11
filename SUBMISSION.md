# DoraHacks submission — copy

## Vision / the problem this solves

**Event contracts expire in minutes. Human conviction doesn't.**

A dreamDEX event contract asks whether BTC closes higher in the next sixty
seconds, then dies. The venue immediately rolls a successor, and another, and
another. If your actual view is "I'm bullish on BTC," expressing it means
returning every single minute — redeem the winner, find the successor, size it,
sign it — forever. No person does that. So the highest-frequency, zero-fee
prediction market in crypto is, in practice, a venue for bots, and the retail
demand that prediction markets are supposed to serve never arrives.

AutoRoll collapses that infinite chain of expiring windows into **one position
that never expires.**

You pick an asset, a side, and a size, and sign once. From then on an on-chain
vault holds custody and does the rest: when a window settles it redeems the
winning outcome and re-enters the successor automatically, with no second
signature and no process you have to trust. A fraction of the bankroll goes into
each window, so a loss costs the stake and not the position, and explicit stops —
consecutive losses, take-profit, roll count — end the run and return the money.
One tap in, one tap out, and hundreds of windows in between.

**This can only exist here.** Rolling a position two hundred times through a
venue charging two percent in fees leaves nothing at the end — perpetual rolling
is not a feature you add to a prediction market, it is a thing that only becomes
possible at zero fees, which is dreamDEX's defining property. And doing the roll
without an off-chain operator requires a chain where a contract can react to a
settlement the moment it lands, which is Somnia's. Take either property away and
the product is not worse, it is impossible.

The ecosystem consequence is direct: **a single tap generates a trade every
window, indefinitely.** One user rolling on the 60-second series is over a
thousand on-chain trades a day, and every one of them is real order flow into
Event Contracts rather than a balance sitting idle.

## Category

**Consumer-facing trading application** — with an agent surface: the roll policy
is an interface, so an AI agent can drive each successive window instead of a
person, and because every roll is an on-chain trade, an agent's track record is
verifiable rather than self-reported.

## Links

| Field | Value |
|---|---|
| GitHub | `https://github.com/successaje/autoroll` *(push required — see below)* |
| Project website | *(optional — skip, or the Vercel deploy of `app/`)* |
| Demo video | **TODO — script is in `DEMO.md`** |
| Social | *(needs at least one — X/Twitter or Telegram)* |

### Deployed

```
AutoRollVault   0xf0802c0c94bec42ac93bc7439724df04674a7a39
network         Somnia Shannon testnet (chain 50312)
explorer        https://shannon-explorer.somnia.network/address/0xf0802c0c94bec42ac93bc7439724df04674a7a39
```

## Describe the build

Three pieces: a vault contract that owns the loop, two interchangeable drivers
that wake it up, and a mobile-first app that never has to be open for any of it
to work.

### 1. `AutoRollVault` — the loop, on chain

One Solidity contract (~1,500 lines with the interfaces) holding custody and the
whole state machine. A position is an asset, a side, a bankroll, and a policy:
fraction of bankroll per window (`sizeBps`), consecutive-loss stop
(`maxLosses`), take-profit, roll cap, a price limit, and whether to compound.
The contract does two things forever — `_enter` on a new window, `_harvest` on a
settled one — and between them applies the stops and pays out.

Four decisions carry most of the weight:

**Entry is IOC, never a resting order.** A resting bid that goes unfilled leaves
escrow in the pool that the vault cannot attribute back to a single position
when the window expires, which silently books a filled-nothing roll as a total
loss. IOC either fills now or commits nothing, and the position is charged what
was *actually* spent rather than the stake requested — a partial fill returns
the remainder in the same call.

**Prices are snapped to the pool's own grid, read live.** `tickSize`,
`lotSize` and `minQuantity` come from `getOrderBookParameters()`, never
hardcoded. The two sides snap in opposite directions: a Up buy rounds its limit
DOWN, a Down buy is an ask at `one − q` so it rounds UP, because a higher YES
price is a *cheaper* NO contract. Rounding both the same way silently overspends
on one side.

**Each position tracks its own outcome-token quantity.** Outcome tokens are an
ERC-6909 singleton keyed by outcome, not by holder, so `balanceOf(vault, yesId)`
is a pooled number across every position in that window. Redeeming it pays the
first position everything and books the rest as losses. The fill is measured at
entry and redeemed exactly.

**The batch queues compact rather than clear.** Work is capped per event so a
handler cannot run out of gas; the remainder stays queued for the next
(permissionless, idempotent) call instead of being deleted with the positions
still inside it.

### 2. Two drivers, one set of internals

`subscribeAll` registers two Somnia reactivity subscriptions — wildcard filters
on the module's `MarketFinalized` and `MarketCreated` — so the chain itself
invokes the handler at settlement with no operator in the loop.

Because a subscription requires 32 STT parked in the contract, the same
internals are also reachable through `pokeFinalized` / `pokeCreated`: public,
permissionless, idempotent. A keeper (`src/keeper.ts`) watches the same two
events over plain RPC and calls them — deliberately no SDK and no indexer, so it
cannot drift from what the reactive path sees. It chunks `eth_getLogs` at 999
blocks, because Somnia's 1000-block cap is **100 seconds** of history at 100ms
blocks.

This is not a fallback bolted on. Reactivity is the fast path and the keeper is
the backstop for a handler that ran out of gas or lost its queue slot, and
either can drive a vault alone.

### 3. The app

React and viem, reading the vault directly — no server, no indexer. A position
is one card: equity, the curve, streak, and a stop button. The bankroll curve
comes from a bounded 32-point ring in the contract rather than a log scan,
because a 1000-block window cannot reach backwards far enough to rebuild an
hour-old position.

`?watch=0x…` opens any position read-only with no wallet at all, which is how a
running position gets shown to someone who has nothing installed.

### Also in the repo

An off-chain roller built on `@somnia-chain/markets-sdk` (the Bot Kit surface)
that runs the identical policy engine — it was the honest baseline the vault was
measured against, and it still runs the product without a deployment.
`npm run check:abi` compares every selector the app declares against the
compiled contract; a hand-copied struct with one integer width wrong is a
different selector and reverts with empty data, which is indistinguishable from
a failing token transfer and cost an hour to find once.

### Verification

31 tests, all against forked live Shannon state rather than mocks — both sides
of the book at exact fill prices the venue's real grid produces, the fund-loss
regressions, the grid maths, and a full enter → settle → re-enter roll.

## Ecosystem tags

| Field | Value |
|---|---|
| Layer-1s | **Somnia** — EVM L1, Shannon testnet chain 50312 (mainnet 5031) |
| Layer-2s | *(empty — the project touches no L2)* |
| Appchains | *(empty — that field means Cosmos SDK chains)* |
| Other ecosystems | **dreamDEX** — Event Contracts are the substrate of the product |

These are optional, and padding them is a bad trade: a reviewer who spots a
tagged ecosystem the project does not actually integrate discounts everything
else on the page. Two near-misses worth naming so nobody adds them later —

- **Somnia's settlement oracle.** Markets carry an `oracleQuestionId` and
  resolution is oracle-driven, but this contract never calls the oracle; it
  consumes a result dreamDEX has already settled. Adjacent, not integrated.
- **Foundry, viem, React, ERC-6909.** Build tooling and a token standard.
  ERC-6909 looks like a tag but is only how outcome tokens are represented.

## Technical claims that are safe to make

Every one of these is verifiable from the repo or the chain:

- Deployed and live on Shannon; constructor wiring checked against the real
  protocol addresses (`npm run verify-vault`)
- A complete roll executed on the live chain: enter, settle, re-enter, unattended
- 31 tests against live Shannon state, including both sides of the book and the
  exact fill prices the venue's grid produces
- `closePosition` signed from a browser wallet, paying out on chain
- Zero-fee, tick- and lot-snapped IOC entry, read from the pool's own grid

## Claims to avoid

- **Do not say the chain drives it with no keeper.** The reactivity subscription
  is implemented and the handler shares its internals with the keeper's
  permissionless entry points, but the deployed vault is **not subscribed**
  (that needs 32 STT parked in the contract). A keeper process does the work
  today. `DEMO.md` has honest wording that keeps the strength of the claim.
- Do not describe `openPosition` from the browser as proven until it has been
  signed once end to end. Connect, faucet and close are proven; open is not.
