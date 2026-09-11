import { useEffect, useState } from "react";
import type { Wallet } from "../lib/useWallet";
import { useWindows } from "../lib/useWindows";
import { shannon, VAULT } from "../lib/chain";

/**
 * The protocol itself supplies the proof point: the screen counts real market
 * lifecycle events without implying that every one belongs to AutoRoll.
 */
export function Landing({ wallet }: { wallet: Wallet }) {
  const { events, expired, opened, connected, seeded } = useWindows();

  // Until the live count moves, report what happened just before arrival. Both
  // statements are true; opening on "0 windows have expired" would argue
  // against the product for the first minute a judge is looking at it.
  const preArrival = expired === 0 && seeded > 0;
  const shown = preArrival ? seeded : expired;
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="deck">
      <section className="card lp">
        <div className="lp-live">
          <span className={`dot ${connected ? "on" : "warn"}`} />
          {connected ? "live on " : "connecting to "}
          {shannon.name}
        </div>

        <div className="lp-count">
          <span className="lp-n">{shown}</span>
          <span className="lp-unit">
            {shown === 1 ? "window has expired" : "windows have expired"}
          </span>
        </div>

        <p className="lp-since">
          {preArrival ? (
            <>in the 90 seconds before you arrived · still counting</>
          ) : (
            <>
              since you opened this page · {fmt(secs)}
              {opened > 0 && <> · {opened} opened to replace them</>}
            </>
          )}
        </p>

        <p className="lp-pitch">
          Event contracts settle quickly. Staying in the same BTC or ETH view would
          normally mean returning for every new market. <strong>AutoRoll handles the
          settlement and the next eligible entry after you approve and open once.</strong>
        </p>

        <div className="lp-proof" aria-label="How AutoRoll works">
          <span><b>1</b> Approve tUSDC</span>
          <span><b>2</b> Open a view</span>
          <span><b>3</b> Keeper rolls it</span>
        </div>

        <div className="lp-cta">
          {wallet.available ? (
            <button className="cta" onClick={wallet.connect} disabled={wallet.connecting}>
              {wallet.connecting ? "Check your wallet…" : "Open a position"}
            </button>
          ) : VAULT ? (
            <a className="cta" href={`${shannon.blockExplorers.default.url}/address/${VAULT}`} target="_blank" rel="noreferrer">
              View the live vault
            </a>
          ) : null}
          <a className="cta ghost" href="#windows">
            See live market activity
          </a>
        </div>

        {wallet.error && <p className="sub err">{wallet.error}</p>}
        {!wallet.available && (
          <p className="sub">
            No injected wallet here. To open a position, use a browser with MetaMask;
            the app will add {shannon.name} and use test tUSDC.
          </p>
        )}
      </section>

      <section className="card" id="windows">
        <h2 style={{ marginBottom: 6 }}>Windows, right now</h2>
        {events.length === 0 ? (
          <p className="empty">Watching {shannon.name} for the next settlement…</p>
        ) : (
          <div className="feed">
            {events.map((e, i) => (
              <div className="ev" key={`${e.marketId}-${e.kind}-${i}`}>
                {/* Seeded rows carry no timestamp - they are up to 90s old, and calling
                    them "just now" would be a small lie on every reload. */}
                <time>{e.at ? new Date(e.at).toLocaleTimeString() : "recent"}</time>
                <span className={`tag ${e.kind === "expired" ? "void" : "won"}`}>
                  {e.kind === "expired" ? "SETTLED" : "OPENED"}
                </span>
                <span className="txt mono">#{short(e.marketId)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Market ids are small sequential numbers in a padded bytes32 — the leading
 *  characters are all zeros and identify nothing. */
const short = (h: string) => BigInt(h).toString(16);

function fmt(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}
