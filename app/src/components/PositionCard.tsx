import { EquityCurve } from "./EquityCurve";
import { money, pnl } from "../lib/format";
import type { Position, RollerEvent } from "../lib/types";

export function PositionCard({
  position,
  decimals,
  lastEntered,
  onClose,
}: {
  position: Position;
  decimals: number;
  lastEntered: Extract<RollerEvent, { kind: "entered" }> | null;
  onClose?: () => void;
}) {
  // A closed position has paid out, so `bankroll` is zero on chain — showing
  // that as the headline reads as a total loss when the user was actually paid.
  // The last curve point is the bankroll the payout was made from, which is the
  // number they walked away with.
  // Funds committed to a live window have left `bankroll` but are still the
  // user's money — the headline is what they own, not what happens to be idle.
  const equity = position.active
    ? (BigInt(position.bankroll) + BigInt(position.atRisk)).toString()
    : (position.history.at(-1)?.bankroll ?? position.principal);
  const { pct, label } = pnl(equity, position.principal);
  const tone = pct > 0.05 ? "pos" : pct < -0.05 ? "neg" : "flat";
  const wins = position.history.filter((h) => h.won).length;
  const exposed = Boolean(position.marketId);
  const stateLabel = !position.active ? "closed" : exposed ? "in a window" : "between windows";

  return (
    <section className="card stack">
      <div className="row">
        <h2>
          {position.asset} {position.up ? "Up" : "Down"} · {position.active ? "rolling" : "finished"}
        </h2>
        <span className="badge">
          <span className={`dot ${position.active && exposed ? "on" : ""}`} />
          {stateLabel}
        </span>
      </div>

      <div className="hero">
        <span className="value">{money(equity, decimals)}</span>
        <span className={`delta ${tone}`}>{label}</span>
      </div>

      <EquityCurve position={position} decimals={decimals} />

      <div className="stats">
        <div className="stat">
          <div className="k">Rolls</div>
          <div className="v">{position.rolls}</div>
        </div>
        <div className="stat">
          <div className="k">Won</div>
          <div className="v">
            {wins}
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>/{position.rolls}</span>
          </div>
        </div>
        <div className="stat">
          <div className="k">{exposed ? "At risk" : "Deposited"}</div>
          <div className="v">{money(exposed ? position.atRisk : position.principal, decimals)}</div>
        </div>
      </div>

      {position.active && (
        <div className="window">
          <div className="meta">
            <div className="name">{lastEntered && exposed ? lastEntered.symbol : "next window"}</div>
            <div className="state">
              {exposed
                ? lastEntered
                  ? `Holding ${position.up ? "Up" : "Down"} at ${lastEntered.price.toFixed(3)} · ${money(position.atRisk, decimals)} staked`
                  : "Holding"
                : "Waiting for the next window to open"}
            </div>
          </div>
        </div>
      )}

      {position.active && onClose ? (
        <button className="cta ghost" onClick={onClose}>
          Stop rolling
        </button>
      ) : position.active ? (
        <p className="sub">Rolling. Connect the owning wallet to stop it.</p>
      ) : (
        <p className="sub">
          Closed after {position.rolls} {position.rolls === 1 ? "roll" : "rolls"}.
        </p>
      )}
    </section>
  );
}
