# AutoRoll — five-minute showcase runbook

## The one-line story

AutoRoll turns a sequence of expiring DreamDEX event markets into one persistent,
policy-controlled position: approve and open once, then the vault settles and enters
eligible successor windows until the user's stop rules fire.

## Before Monday

1. Send the organiser your Discord handle and confirm that the account has speaker access.
2. Use the same computer, browser profile, wallet and network that you will present with.
3. Run `npm run showcase:check`. Do not present until it shows an active position with
   live or completed-roll evidence.
4. Run the keeper live and keep its funded account above the gas budget:
   `npm run keeper -- --vault 0xf0802c0c94bec42ac93bc7439724df04674a7a39 --live --verbose`.
5. Warm the position for at least 30 minutes. Confirm that rolls appear in the app and
   that the keeper continues after at least one settlement.
6. Open the watch-only URL printed by `showcase:check` in a clean browser window. Load it
   successfully once so its last verified on-chain snapshot is available if an RPC drops.
7. Keep these tabs open in order: marketing site, Markets, live watch-only Portfolio,
   live Position, vault explorer, repository.
8. Disable notifications, plug in power, use wired internet if available, and join Discord
   10 minutes early to test audio and screen sharing.

## Five-minute script

### 0:00–0:40 — problem

DreamDEX event contracts expire and are replaced by new windows. A trader who wants to
keep applying the same directional policy must settle and re-enter repeatedly.

### 0:40–1:20 — product

Start on the website: “DreamDEX markets expire; the user's AutoRoll position persists.”
Launch the app, choose Bitcoin, Go Up, enter the amount, and review the entry guardrail
and stop policy. Emphasize one approval to open and no signature on subsequent rolls.

### 1:20–3:20 — live proof

Show the warmed watch-only Portfolio and open its Position. Point to Strategy Equity,
completed rolls, the live successor state, automation driver, and roll history. If a live
window transitions, pause and let the rollover sequence tell the story. Then show one
transaction in the explorer.
State clearly that the current deployment is driven by permissionless keeper calls; the
same vault also supports Somnia Reactivity once its 32 STT subscription balance is parked.

### 3:20–4:10 — why DreamDEX/Somnia

Zero trading and settlement fees make frequent rolling economically possible. The CLOB,
on-chain outcomes and permissionless execution make every result independently auditable.

### 4:10–5:00 — next

The next version is audited rolling-strategy infrastructure: remove administrative access
to user collateral, activate Reactivity, add invariant testing and independent keepers,
then add historical risk simulations and strategy creators with verifiable track records.

## Failure plan

- Wallet fails: do not debug on stage. Switch to the warmed watch-only URL.
- One RPC fails: the app automatically tries the second endpoint.
- Both RPCs fail: the app shows its timestamped last verified snapshot. Say that it is a
  cached on-chain snapshot, then open the explorer or repository.
- No fill occurs: explain that IOC refused an entry above the user's price limit; funds
  remain queued. This is risk control, not a failed roll.
- Keeper stops: show the already completed roll and explain the permissionless backstop.
