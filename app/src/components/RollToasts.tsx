import { useEffect, useRef, useState } from "react";
import { useNavigation } from "../lib/navigation";
import { money } from "../lib/format";
import { CoinIcon } from "./CoinIcon";
import type { Position } from "../lib/types";

interface Toast {
  key: number;
  id: number;
  asset: string;
  up: boolean;
  won: boolean;
  rolls: number;
  equity: string;
}

const LIFETIME = 7_000;

/**
 *  A quiet corner notice when a position rolls.
 *
 *  The whole promise of the product is that it keeps working while you are not
 *  looking, which is invisible by construction — you watch a card not change
 *  and have to take it on faith. This is the moment made visible: the vault
 *  settled a window and entered the next one, and nobody signed anything.
 *
 *  Driven by `rolls` incrementing on a position rather than by the event feed,
 *  because that counter is vault state. A reload cannot replay old rolls as if
 *  they just happened.
 */
export function RollToasts({ positions, decimals }: { positions: Position[]; decimals: number }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Map<number, number> | null>(null);
  const nextKey = useRef(0);

  useEffect(() => {
    if (positions.length === 0) return;

    // First pass records the baseline. Without this, every position announces
    // its whole history the moment the page opens.
    if (seen.current === null) {
      seen.current = new Map(positions.map((p) => [p.id, p.rolls]));
      return;
    }

    const fresh: Toast[] = [];
    for (const p of positions) {
      const before = seen.current.get(p.id);
      seen.current.set(p.id, p.rolls);
      if (before === undefined || p.rolls <= before) continue;

      const last = p.history.at(-1);
      fresh.push({
        key: nextKey.current++,
        id: p.id,
        asset: p.asset,
        up: p.up,
        won: last?.won ?? false,
        rolls: p.rolls,
        equity: (BigInt(p.bankroll) + BigInt(p.atRisk)).toString(),
      });
    }
    if (fresh.length === 0) return;

    // Two at a time. A stack of these during a fast cadence stops being a
    // signal and starts being weather.
    setToasts((prev) => [...fresh, ...prev].slice(0, 2));
  }, [positions]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => setToasts((prev) => prev.slice(0, -1)), LIFETIME);
    return () => clearTimeout(t);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="roll-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <RollToast
          key={t.key}
          toast={t}
          decimals={decimals}
          onDismiss={() => setToasts((prev) => prev.filter((x) => x.key !== t.key))}
        />
      ))}
    </div>
  );
}

function RollToast({
  toast,
  decimals,
  onDismiss,
}: {
  toast: Toast;
  decimals: number;
  onDismiss: () => void;
}) {
  const { go } = useNavigation();
  return (
    <button
      className={`roll-toast ${toast.won ? "won" : "lost"}`}
      onClick={() => {
        go({ name: "position", id: toast.id });
        onDismiss();
      }}
    >
      <CoinIcon asset={toast.asset} size={28} />
      <span className="roll-toast-body">
        <b>
          Roll {toast.rolls} · {toast.asset} {toast.up ? "↑" : "↓"}
        </b>
        <small>
          {toast.won ? "Window won" : "Window lost"} · rolled into the successor
        </small>
      </span>
      <span className="roll-toast-equity">
        {money(toast.equity, decimals)}
        <small>tUSDC</small>
      </span>
    </button>
  );
}
