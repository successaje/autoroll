# Demo video — shot list

Target 2:45, four beats: **the problem**, **the one tap**, **the mechanism**,
**the claim**.

Everything below runs against the deployed vault, not the off-chain roller.
That matters for the pitch: every roll is a transaction anyone can open in an
explorer, which is a different kind of claim from a server that says it traded.

```
vault     0xf0802c0c94bec42ac93bc7439724df04674a7a39
explorer  https://shannon-explorer.somnia.network/address/0xf0802c0c94bec42ac93bc7439724df04674a7a39
watch     http://localhost:5184/?watch=<the wallet that owns the position>
```

---

## Read this before you plan the timing

**Windows are not all 60 seconds.** The venue runs a 60s series and a 300s
series at the same time, and the vault enters whichever window opens next. Our
first live roll landed in a 300-second window: entered 19:15:11, settled
19:20:06. Measured, not assumed —

```
#1965d  window 300s      #19655  window 60s
#19657  window 300s      #1966d  window 60s
```

So **you cannot count on a complete enter → settle cycle inside a 2:45 take.**
Plan around it:

- Warm the position up for 20–30 minutes before recording, so the curve and the
  activity feed are already populated when the camera starts.
- Show a live **entry** on camera — those happen every minute or so.
- Point at an *already settled* roll in the activity feed for the settlement
  half, rather than waiting for one.
- Keep a long take running in the background as a backup and speed it up 10× in
  the edit if you want the curve building in one continuous shot.

**Not every window fills.** At a 0.65 limit some windows have no asks under it,
and the vault correctly commits nothing and stays queued — you will see
`RollSkipped "no fill at limit"` in the keeper log. That is the IOC behaviour
working. If it shows up on camera, say so; it is a feature and it takes ten
seconds to explain.

---

## Before you hit record

```bash
# 1. keeper, in its own terminal - you will cut to this
PRIVATE_KEY=0x... npx tsx src/keeper.ts --vault 0xf0802c0c94bec42ac93bc7439724df04674a7a39 --live --verbose

# 2. the app
cd app && npm run dev

# 3. warm up: open a position and leave it 20-30 min
PRIVATE_KEY=0x... npx tsx scripts/open-position.ts \
  --vault 0xf0802c0c94bec42ac93bc7439724df04674a7a39 --asset BTC --up --stake 50
```

Record the app at **mobile width (375px)**. It is a mobile-first product and a
maximised desktop window makes it look like a half-empty dashboard.

Check the deployer still has STT — each keeper poke costs gas (~1.9M for an
entry), and a keeper that runs out mid-take is a silent demo failure.

**Rehearse the wallet flow at least once before recording.** Connect, approve,
sign, open. It is the one path that has never been exercised end to end; the
calldata is verified correct (`npm run check:abi`) but the browser handshake is
not. If it misbehaves, fall back to opening via the script off camera and
narrating the watch link instead.

---

## Beat 1 — the problem (0:00–0:35)

**On screen:** the dreamDEX market list, 60-second BTC series. Let a window tick
down, expire, and its successor appear.

> "This is a dreamDEX event contract. Will BTC close higher in the next sixty
> seconds. Clean market — zero maker fees, zero taker fees, zero settlement fees.
>
> And in sixty seconds it's gone, replaced by the next one. If you're simply
> bullish on BTC you have to come back and re-enter every minute, forever.
> Nobody does that. So these markets belong to bots, and everyone else is
> locked out."

Do not rush this. Judges cannot feel what the product solves until they have
watched the thing vanish.

## Beat 2 — the one tap (0:35–1:10)

**On screen:** the app. BTC, **Up**, 50, tap the CTA, sign in the wallet. Then
hands in your lap while the position card fills the screen.

> "AutoRoll collapses that infinite chain into one position that never expires.
> Asset, side, one signature.
>
> That's the last thing I do in this demo. Everything after this happens without
> me."

Hold the shot with your hands visibly off the keyboard. The silence is the pitch.

## Beat 3 — the mechanism (1:10–2:05)

**On screen:** the position card, then cut to the keeper terminal around 1:30 so
the `enter` and `harvest` lines scroll past. Then open one of those transaction
hashes in the explorer.

> "Each window resolves, the vault redeems the winning side and re-enters the
> successor. On chain, in the vault, no second signature.
>
> There's the entry. Here's the same roll in the explorer — every position this
> thing takes is a real transaction against a real contract.
>
> It stakes a fraction of the bankroll per window, so a loss costs the stake and
> not the position. This one lost: eight of fifty in, eight gone, forty-two still
> working, and four straight losses stop it automatically.
>
> And it only works at zero fees. Roll a position two hundred times through a
> venue charging two percent and the fees eat the whole stake. Perpetual rolling
> isn't a feature you add — it only exists at zero."

The loss is the strongest part of this beat. **Do not hide it.** A run where the
stop-loss arithmetic visibly holds is more convincing than a lucky streak,
because it proves the part a judge would otherwise have to take on faith.

## Beat 4 — the claim (2:05–2:45)

**On screen:** paste the `?watch=` link into a fresh browser — no wallet, no
connect prompt, the live position just appears.

> "Anyone can watch a live position with this link. No wallet, nothing installed.
>
> The same engine runs an agent's policy instead of a person's, and because every
> roll is an on-chain trade, a leaderboard can't be self-reported.
>
> For the ecosystem the maths is simple: one tap generates a trade every window,
> indefinitely. One user is a thousand trades a day.
>
> Deployed on Shannon, thirty-one tests against the live chain, running right
> now. AutoRoll — perpetual event contracts on dreamDEX."

The watch link is the best closing shot you have. It turns "trust my recording"
into "open it yourself", and judges can.

---

## Say this, or cut the line

**The vault is not subscribed to reactivity.** It is driven by the keeper, which
polls the same two module events a subscription would filter on and calls the
same permissionless entry points. Identical internals, and the design supports
both — but a keeper process is doing the work in this recording.

So **do not say "no keeper" or "the chain drives it" over footage of the keeper
terminal.** Either subscribe before recording (needs 32 STT in the vault; the
deployer has far less, and that is faucet-gated), or narrate it honestly:

> "Right now a keeper drives this, calling the vault's public entry points. The
> vault also holds a reactivity subscription that does the identical work from
> the chain itself, with no process in the loop — that needs 32 STT parked in the
> contract, which is the one thing a testnet faucet won't hand me today."

That version costs you eight seconds and buys you every ounce of credibility in
the room. An overclaim a judge can check is much worse than a caveat.

Same rule for `fakeOracle.resolve()`: Shannon exposes it, it is legitimate for
testing, and using it undisclosed in a submitted demo is the single fastest way
to lose the whole thing. If you use it for anything — even just to make a window
resolve on cue — put it on screen.

## Backup shots

- `forge test --fork-url ...` — 31 green against live Shannon
- `npm run check:abi` — every selector matching the compiled contract
- `npx tsx scripts/verify-vault.ts <vault>` — constructor wiring against the real protocol
- The keeper's discovery stream: a finalize/create pair per asset, every minute
- A 10× speed-up of a 30-minute run
