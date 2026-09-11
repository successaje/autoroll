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
- 27 tests against live Shannon state, including both sides of the book and the
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
