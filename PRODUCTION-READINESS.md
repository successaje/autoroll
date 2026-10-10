# Production readiness

Assessed 10 October 2026 against the deployed vault
`0xf0802c0c94bec42ac93bc7439724df04674a7a39` on Somnia Shannon.

## The headline finding

**The product had been broken for eleven days and said it was fine.**

The vault's last transaction was 29 September. One position — #11, 25 tUSDC
principal, 53 rolls — was stranded holding 3.35 tUSDC and 6.8M outcome tokens
in a window that had already settled. Over that whole period:

- every position row read `↻ AutoRoll active`
- the status page reported `Operational`
- `Roll execution` reported `Keeper`, which was a hardcoded string

None of those three claims was measured against anything. The product's single
promise is that positions keep rolling while nobody watches, so a liveness
claim it never checks is the most damaging thing it can display.

### Why it broke, precisely

The keeper was running the whole time. It was supervised by launchd, restarting
on crash, logging normally, and watching every market open and settle. It just
never acted.

It is purely event-driven with a bounded startup lookback. If it is down at the
moment a market it holds finalizes, it never witnesses that event, and no later
scan reaches back far enough to find it — eleven days is roughly 9.5 million
blocks, against an `eth_getLogs` ceiling of 1000. A DNS failure on
`dream-rpc.somnia.network` took it down for long enough to miss one settlement,
and that was permanent.

A monitor watching the keeper process would have reported green throughout.

## What changed

**Liveness is measured.** `useLiveness` reads the vault's own last roll or
settlement from the explorer index — the RPC log window is too short to tell
"quiet for a minute" from "dead for a week". Under 15 minutes is normal, since
windows can go unfilled. Position rows, the position badge, the portfolio and
the status page all derive from that one measurement. An unreachable explorer
reports `unknown` rather than falling back to "fine".

**The keeper reconciles against vault state.** Every ten minutes it asks the
vault what it is actually exposed to, instead of trusting that it saw every
event. For each active position holding collateral it resolves the market from
that position's last `PositionRolled` log and settles it. Verified in dry run:
it finds position #11 stranded in market `#208ae`.

**Recovery is a user action.** `pokeFinalized` was always permissionless; that
was true and useless, because nothing in the product exposed it. A stalled
position now offers **Resume rolling**, which any connected wallet can use —
not just the owner's — to settle the stranded window.

**Supervision and health.** `ops/install-keeper.sh` installs a launchd agent;
`ops/keeper-health.sh` checks the process and the chain **separately**, because
the process being up is not evidence that rolling works. That gap is exactly
how this hid.

**Smaller:** unknown `/app` paths get a real 404 instead of silently showing
marketing; the service-worker test now exercises both the network and offline
paths, where before its harness stubbed `fetch` to succeed and so only ever
asserted the cache-only behaviour that let stale shells survive redeploys.

## Verified

- 33 Foundry tests against forked live Shannon state
- 4 service-worker/PWA tests
- TypeScript clean in both packages
- `check-abi` — every selector the app declares matches the compiled contract
- Reconcile pass, **live**: settled position #11 out of market `#208ae`,
  rolls 53 → 54, `inMarketCount` 0, vault rolling again within seconds
- RPC failover: returns a block with a deliberately unresolvable primary
- Resume path: market resolves to `#208ae`, `inMarketCount` 1,
  `simulateContract` succeeds
- Deployed bundle contains the new states; status page renders
  "Rolling stopped · 11 days since last roll"

## Not verified

- **The Resume button has never been clicked.** The call is simulate-verified,
  not signature-verified. The same code path it would exercise has now run
  live from the keeper, which is good evidence but not the same test.
- No load or concurrency testing. No claim is made about scale.
- No end-to-end browser test suite; UI verification is manual.
- Contracts are unaudited.

## Blockers to a genuine production launch

1. **Unaudited contracts holding user funds.** Testnet-only until that changes.
2. **One keeper, run by one person, on a laptop.** Reconcile and the Resume
   button reduce the blast radius; they do not remove the dependency. Nothing
   economically motivates a third party to poke a stalled vault, so
   "permissionless" currently means "the team, or a user who notices".
3. **No alerting.** `ops/keeper-health.sh` must be run by a human. Nothing pages
   anyone when rolling stops — which is why nobody noticed for eleven days.
4. **Reactivity is not subscribed.** It needs 32 STT in the vault. Until then
   the keeper is the only driver, and the status page says so.
5. ~~**The installed keeper is a stale copy.**~~ **Resolved 10 Oct.** The
   runtime copy in `~/Library/Application Support/AutoRoll Keeper` was updated
   with the reconcile pass and RPC failover and restarted. On its first pass it
   settled position #11 out of market `#208ae` — eleven days after the event
   that stranded it — and resumed entering windows. Verified on chain: `atRisk`
   0, `inMarketCount` 0, rolls 53 → 54, vault active again. Note the runtime
   copy is updated by hand; `scripts/install-keeper-mac.sh` also overwrites
   `.env.keeper`, so a targeted `src/keeper.ts` copy is the safer path.
6. **Explorer dependency.** Liveness, per-roll hashes and reconcile all read the
   explorer index. It degrades safely, but it is a single third party.

## The next thing worth building

Incentivised poking. The vault pays nothing to whoever advances it, so its
permissionless entry points rely on goodwill. A small fee from the rolled
position to the caller would make the design self-healing in fact rather than
in principle, and would remove blocker 2 outright.
