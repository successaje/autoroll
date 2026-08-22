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

  const amount = Number(stake);
  const ready = up !== null && Number.isFinite(amount) && amount > 0;

  return (
    <section className="card stack">
      <div>
        <h2>Take a view</h2>
        <p className="sub">One tap. It rolls into every new window until you stop it.</p>
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
        <button className="chip" aria-pressed={streak} onClick={() => setStreak(!streak)}>
          Streak mode
        </button>
      </div>

      <p className="sub">
        {streak
          ? "Puts the whole bankroll on every window and stops at the first loss. No house edge — the venue charges zero fees."
          : "Stakes 20% of the bankroll per window and stops after four losses in a row."}
      </p>

      <button
        className="cta"
        disabled={!ready || busy}
        onClick={() => ready && onOpen({ asset, up: up!, stake: amount, streak })}
      >
        {busy && step ? step : up === null ? "Pick a side" : `Roll ${asset} ${up ? "Up" : "Down"} · ${stake || "0"} tUSDC`}
      </button>
    </section>
  );
}
