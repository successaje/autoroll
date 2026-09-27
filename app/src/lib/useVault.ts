import { useCallback, useEffect, useRef, useState } from "react";
import { COLLATERAL_DECIMALS } from "./chain";
import { readBalance, readHistory, readPositions } from "./vault";
import type { Position, RollerEvent } from "./types";

/** Poll the vault. 2s matches the roller's tick, so both modes feel identical. */
export function useVault(account: `0x${string}` | null) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [balance, setBalance] = useState<bigint>(0n);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const cacheKey = account ? `autoroll:vault:${account.toLowerCase()}` : null;

  const refresh = useCallback(async () => {
    if (!account) {
      setPositions([]);
      return;
    }
    if (inFlight.current) return inFlight.current;

    const work = (async () => {
      setLoading(true);
      try {
        const [rows, bal] = await Promise.all([readPositions(account), readBalance(account)]);
        const withHistory = await Promise.all(
          rows.map(async (p) => ({
            ...p,
            history: await readHistory(p.id, BigInt(p.principal), p.rolls),
          })),
        );
        setPositions(withHistory);
        setBalance(bal);
        setError(null);
        setStale(false);
        const updatedAt = Date.now();
        setLastUpdated(updatedAt);
        try {
          localStorage.setItem(
            `autoroll:vault:${account.toLowerCase()}`,
            JSON.stringify({ positions: withHistory, balance: bal.toString(), updatedAt }),
          );
        } catch {
          /* Private browsing can disable storage; live reads still work. */
        }
      } catch (err: any) {
        setError(err?.shortMessage ?? err?.message ?? "Could not read the vault");
        // Keep the last verified on-chain snapshot visible during an RPC outage.
        // It is explicitly marked stale in the UI; this is continuity, not fake live data.
        if (cacheKey) {
          try {
            const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
            if (cached?.positions && cached?.balance && cached?.updatedAt) {
              setPositions(cached.positions);
              setBalance(BigInt(cached.balance));
              setLastUpdated(cached.updatedAt);
              setStale(true);
            }
          } catch {
            /* A corrupt cache should never make the read failure worse. */
          }
        }
      } finally {
        setLoading(false);
      }
    })();
    inFlight.current = work;
    try {
      await work;
    } finally {
      if (inFlight.current === work) inFlight.current = null;
    }
  }, [account, cacheKey]);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 2_000);
    return () => clearInterval(t);
  }, [refresh]);

  // The on-chain feed is derived from the same history the chart uses, so the
  // two can never disagree.
  const feed: RollerEvent[] = positions.flatMap((p) =>
    p.history.map((h) => ({
      kind: "rolled" as const,
      id: p.id,
      won: h.won,
      voided: false,
      staked: h.staked,
      returned: h.returned,
      bankroll: h.bankroll,
      delta: h.delta,
      // The curve ring stores values and order, not block timestamps. Inventing
      // wall-clock times on every poll made old rolls look newly settled.
      at: 0,
    })),
  );

  return { positions, balance, decimals: COLLATERAL_DECIMALS, feed, error, loading, stale, lastUpdated, refresh };
}
