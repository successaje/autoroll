import { useMemo, useRef, useState } from "react";
import { toNum } from "../lib/format";
import type { Position } from "../lib/types";

/**
 *  Bankroll across rolls — one series, so no legend: the card's title names it.
 *  The dashed baseline is the principal, which is the only comparison the reader
 *  actually wants. Win/loss is not encoded in colour here; the curve's direction
 *  already carries it, and a red/green pair would fail CVD separation anyway.
 */
export function EquityCurve({ position, decimals }: { position: Position; decimals: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 420;
  const H = 132;
  const PAD = { t: 12, r: 12, b: 20, l: 12 };

  const points = useMemo(() => {
    const principal = toNum(position.principal, decimals);
    // `history[].bankroll` is recorded at harvest, when nothing is committed, so
    // each point is already total equity and lines up with the headline figure.
    const vals = [principal, ...position.history.map((h) => toNum(h.bankroll, decimals))];
    return vals.map((v, i) => ({ roll: i, value: v }));
  }, [position, decimals]);

  const principal = toNum(position.principal, decimals);
  const lo = Math.min(...points.map((p) => p.value)) * 0.92;
  const hi = Math.max(principal, ...points.map((p) => p.value)) * 1.04;
  const span = hi - lo || 1;

  const x = (i: number) =>
    PAD.l + (points.length < 2 ? 0 : (i / (points.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area =
    points.length > 1
      ? `${line} L${x(points.length - 1).toFixed(1)},${y(lo).toFixed(1)} L${x(0).toFixed(1)},${y(lo).toFixed(1)} Z`
      : "";

  const head = points.at(-1)!;
  const active = hover !== null ? points[hover] : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    }
    setHover(best);
  }

  return (
    <div className="chart-wrap" ref={wrap}>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
            aria-label={`Bankroll across ${points.length - 1} rolls, currently ${head.value.toFixed(2)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <line className="baseline" x1={PAD.l} x2={W - PAD.r} y1={y(principal)} y2={y(principal)} />
        <text x={W - PAD.r} y={y(principal) - 5} textAnchor="end">
          break-even
        </text>

        {area && <path d={area} fill="url(#eq)" />}
        <path className="line" d={line} />

        {active && (
          <>
            <line className="crosshair" x1={x(active.roll)} x2={x(active.roll)} y1={PAD.t} y2={H - PAD.b} />
            <circle className="head" cx={x(active.roll)} cy={y(active.value)} r={5} />
          </>
        )}
        {!active && <circle className="head" cx={x(head.roll)} cy={y(head.value)} r={5} />}
      </svg>

      {active && (
        <div
          className="tip"
          style={{
            left: `clamp(0px, ${(x(active.roll) / W) * 100}% - 52px, calc(100% - 104px))`,
            top: 0,
          }}
        >
          {active.roll === 0 ? "opened" : `roll ${active.roll}`}
          <br />
          <b>
            {active.value.toFixed(2)} <span style={{ color: "var(--text-muted)" }}>tUSDC</span>
          </b>
        </div>
      )}
    </div>
  );
}
