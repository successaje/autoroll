export const toNum = (raw: string, decimals: number) => Number(raw) / 10 ** decimals;

export const money = (raw: string, decimals: number) =>
  toNum(raw, decimals).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Signed percentage change from principal, as a display string. */
export function pnl(stake: string, principal: string): { pct: number; label: string } {
  const a = Number(stake);
  const b = Number(principal);
  if (b === 0) return { pct: 0, label: "0.0%" };
  const pct = ((a - b) / b) * 100;
  return { pct, label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` };
}

export const clock = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
