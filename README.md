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
contracts/src/AutoRollVault.sol      the handler + vault
contracts/src/interfaces/            BinaryMarketsModule, BinaryPool, ERC-6909
contracts/script/Deploy.s.sol        deploy, fund, subscribe
src/config.ts                        Shannon wiring, verified topic0s
src/discover.ts                      window discovery (honours gotchas #1/#9/#12/#13)
scripts/probe-reactivity.mjs         validation #1–#3
scripts/decode-logs.mjs              validation #4–#5
scripts/verify-decoder.mjs           validation #6
```

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
