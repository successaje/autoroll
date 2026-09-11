import { useState } from "react";

export interface OpenRequest {
  asset: string;
  up: boolean;
  stake: number;
  streak: boolean;
}

const ASSETS = ["BTC", "ETH"];

/**
 *  The whole point of the product is that this is the ONLY interaction. Take a
 *  view, pick how long to let it ride, tap once. Everything after that happens
 *  without the user.
 */
export function OpenCard({
  onOpen,
  busy,
  step,
}: {
  onOpen: (r: OpenRequest) => void;
  busy: boolean;
  step?: string | null;
}) {
  const [asset, setAsset] = useState("BTC");
  const [up, setUp] = useState<boolean | null>(null);
  const [stake, setStake] = useState("25");
  const [streak, setStreak] = useState(false);
  const [streakAcknowledged, setStreakAcknowledged] = useState(false);

  const amount = Number(stake);
  const ready = up !== null && Number.isFinite(amount) && amount > 0 && (!streak || streakAcknowledged);

  function toggleStreak() {
    setStreak((current) => {
      if (current) setStreakAcknowledged(false);
      return !current;
    });
  }

  return (
    <section className="card stack">
      <div>
        <h2>Take a view</h2>
        <p className="sub">Use test tUSDC. Choose a view once; the keeper handles eligible new windows until you stop it.</p>
      </div>

      <div className="seg" role="group" aria-label="Asset">
        {ASSETS.map((a) => (
          <button key={a} aria-pressed={asset === a} onClick={() => setAsset(a)}>
            {a}
          </button>
        ))}
      </div>

      <div className="sides">
        <button
          className="side up"
          aria-pressed={up === true}
          aria-label={`Up — ${asset} closes higher`}
          onClick={() => setUp(true)}
        >
          <span className="glyph" aria-hidden>▲</span>
          <span className="word">Up</span>
          <span className="hint">{asset} closes higher</span>
        </button>
        <button
          className="side down"
          aria-pressed={up === false}
          aria-label={`Down — ${asset} closes lower`}
          onClick={() => setUp(false)}
        >
          <span className="glyph" aria-hidden>▼</span>
          <span className="word">Down</span>
          <span className="hint">{asset} closes lower</span>
        </button>
      </div>

      <label className="stake">
        <input
          inputMode="decimal"
          value={stake}
          onChange={(e) => setStake(e.target.value.replace(/[^\d.]/g, ""))}
          aria-label="Stake in tUSDC"
        />
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>tUSDC</span>
      </label>

      <div className="chips" role="group" aria-label="Preset">
        {["10", "25", "100"].map((v) => (
          <button key={v} className="chip" aria-pressed={stake === v} onClick={() => setStake(v)}>
            {v}
          </button>
        ))}
        <button className="chip risk-chip" aria-pressed={streak} onClick={toggleStreak}>
          All-in streak
        </button>
      </div>

      {streak ? (
        <label className="risk-note">
          <input
            type="checkbox"
            checked={streakAcknowledged}
            onChange={(e) => setStreakAcknowledged(e.target.checked)}
          />
          <span><b>High risk.</b> This puts 100% of the bankroll into each window. One losing settlement can end the run.</span>
        </label>
      ) : (
        <div className="policy-summary">
          <span><b>20%</b> per window</span>
          <span><b>4 losses</b> maximum</span>
          <span><b>0.65</b> max entry price</span>
        </div>
      )}

      <button
        className="cta"
        disabled={!ready || busy}
        onClick={() => ready && onOpen({ asset, up: up!, stake: amount, streak })}
      >
        {busy && step ? step : streak && !streakAcknowledged ? "Acknowledge all-in risk" : up === null ? "Pick a side" : `Roll ${asset} ${up ? "Up" : "Down"} · ${stake || "0"} tUSDC`}
      </button>
    </section>
  );
}
