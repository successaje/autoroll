# Demo video — shot list

Target 2:45. Four beats: **the problem**, **the one tap**, **the mechanism**, **the claim**.

Record the app at mobile width (375px) in a phone frame or a narrow window — it is
a mobile-first product and a maximised desktop browser makes it look like a
half-empty dashboard.

---

## Before you hit record

```bash
npm run dev:api          # roller + SSE
npm run dev:app          # UI
npm run demo warm BTC up 250
```

Then **leave it alone for ~20 minutes.** At a 60-second cadence that is roughly
20 points on the curve. This is the single highest-leverage thing you can do:
recording from a cold start shows three rolls and a flat line, and the chart is
the whole visual argument.

Have a second terminal showing the API log — you will cut to it in beat 3.

---

## Beat 1 — the problem (0:00–0:35)

**On screen:** the DreamDEX market list, filtered to the 60-second BTC series.
Let a window tick down and expire on camera, and the successor appear.

> "This is a DreamDEX event contract. Will BTC close higher in the next sixty
> seconds. It's a clean market — zero maker fees, zero taker fees, zero
> settlement fees.
>
> And in sixty seconds it will be gone, replaced by the next one. If you're
> simply bullish on BTC, you have to come back and re-enter every single minute,
> forever. Nobody is going to do that. So today these markets are for bots, and
> everyone else is locked out."

*Don't rush this.* The judges need to feel the expiry to understand what the
product solves.

## Beat 2 — the one tap (0:35–1:10)

**On screen:** the app's open card. BTC, tap **Up**, 250, tap the CTA. Then put
your hands in your lap and let the position card fill the screen.

> "AutoRoll collapses that infinite chain of windows into one position that never
> expires. Pick an asset, pick a side, one tap.
>
> That's the last thing I do in this demo. Everything from here happens without
> me."

Hold the shot for a beat with your hands visibly off the keyboard. That silence
is the pitch.

## Beat 3 — the mechanism (1:10–2:05)

**On screen:** the position card mid-roll — the curve redrawing, the streak
counter, "at risk" changing as it enters and exits windows. Cut to the API log
around 1:35 so the roll lines scroll past.

> "Every sixty seconds the window resolves. The vault redeems the winning side
> and re-enters the successor — on chain, in the same block, with no keeper and
> no second signature. Somnia's reactivity fires the callback the moment the
> oracle posts.
>
> It stakes a fraction of the bankroll each window, so a loss costs the stake and
> not the position. There's the stop-loss firing. Four losses in a row and it
> stops, and the money comes back.
>
> And this only works because the fees are zero. Roll a position two hundred
> times through a venue charging two percent and the fees eat the whole stake.
> Perpetual rolling isn't a feature you add — it only exists at zero."

If a loss lands on camera, **say so and keep going.** A demo where the stop-loss
fires correctly is a better product demo than a lucky streak — it shows the risk
controls work. See "On honesty" below.

## Beat 4 — the claim (2:05–2:45)

**On screen:** the open card again, tapping **Streak mode**; then the repo's
README validation table.

> "The same engine runs an agent's policy instead of a person's, and every roll
> is a verifiable on-chain trade, so a leaderboard can't be self-reported.
>
> For the ecosystem the maths is simple: one tap generates a trade every sixty
> seconds, indefinitely. One user is a thousand trades a day.
>
> The reactivity path is validated on Shannon, the vault is fork-tested against
> the live module, and the whole thing runs today. AutoRoll — perpetual event
> contracts on DreamDEX."

---

## On honesty

A sixty-second BTC window is close to a coin flip, and a recorded run can easily
end down. Two things follow.

**Do not use `fakeOracle.resolve()` to manufacture a winning run.** Shannon
exposes it and it is legitimate for testing, but a submitted demo is a
representation to judges about how the product behaves. If you use it for
anything — even just to make a window resolve on cue — say so on screen. An
undisclosed rigged run is the one thing that can lose you the whole submission.

**A losing run is a fine demo.** The product's claim is mechanical, not
predictive: one tap, hundreds of unattended rolls, risk controls that hold, zero
fees. None of that needs the coin to come up heads. Narrating a real loss and a
real stop-loss is more convincing than a streak, because it proves the part a
judge would otherwise doubt.

## Backup shots worth having

- A 10× speed-up of a 20-minute run, for the curve building in one continuous take
- The `forge test --fork-url` suite going green against live Shannon
- `npm run probe:reactivity` returning the subscription id — the mechanism proof
- The wallet flow: connect, approve, sign, and hands off
