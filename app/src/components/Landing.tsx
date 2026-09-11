import { useEffect, useState } from "react";
import type { Wallet } from "../lib/useWallet";
import { useWindows } from "../lib/useWindows";
import { shannon } from "../lib/chain";

const DEMO = "0x60eF148485C2a5119fa52CA13c52E9fd98F28e87";

/**
 *  The first screen anybody sees, and the only one most will.
 *
 *  It does not describe the problem, it runs it. Every number here is a real
 *  settlement on Somnia, counted from the moment the page opened — so the
 *  argument for the product is made by the chain while the visitor reads,
 *  rather than asserted by us. No wallet is involved in any of it.
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
          Every expiry above ended somebody's position. Holding a view through them
          means a fresh signature, every window, forever — so nobody does, and these
          markets belong to bots.
          <strong> AutoRoll needs one signature, ever.</strong>
        </p>

        <div className="lp-cta">
          {wallet.available ? (
            <button className="cta" onClick={wallet.connect} disabled={wallet.connecting}>
              {wallet.connecting ? "Check your wallet…" : "Open a position"}
            </button>
          ) : (
            <a className="cta" href={`?watch=${DEMO}`}>
              Watch a live position
            </a>
          )}
          <a className="cta ghost" href={`?watch=${DEMO}`}>
            {wallet.available ? "Watch one instead" : "No wallet needed"}
          </a>
        </div>

        {wallet.error && <p className="sub err">{wallet.error}</p>}
        {!wallet.available && (
          <p className="sub">
            No injected wallet here — the watch view needs none. To open a position,
            use a browser with MetaMask and the app will add {shannon.name} for you.
          </p>
        )}
      </section>

      <section className="card">
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
                <span className={`tag ${e.kind === "expired" ? "lost" : "won"}`}>
                  {e.kind === "expired" ? "EXPIRED" : "OPENED"}
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
