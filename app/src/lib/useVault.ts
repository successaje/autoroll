import { useCallback, useEffect, useState } from "react";
import { COLLATERAL_DECIMALS } from "./chain";
import { readBalance, readHistory, readPositions } from "./vault";
import type { Position, RollerEvent } from "./types";

/** Poll the vault. 2s matches the roller's tick, so both modes feel identical. */
export function useVault(account: `0x${string}` | null) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [balance, setBalance] = useState<bigint>(0n);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!account) {
      setPositions([]);
      return;
    }
    try {
      const [rows, bal] = await Promise.all([readPositions(account), readBalance(account)]);
      const withHistory = await Promise.all(
        rows.map(async (p) => ({ ...p, history: await readHistory(p.id) })),
      );
      setPositions(withHistory);
      setBalance(bal);
      setError(null);
    } catch (err: any) {
      setError(err?.shortMessage ?? err?.message ?? "Could not read the vault");
    }
  }, [account]);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 2_000);
    return () => clearInterval(t);
  }, [refresh]);

  // The on-chain feed is derived from the same history the chart uses, so the
  // two can never disagree.
  const feed: RollerEvent[] = positions.flatMap((p) =>
    p.history.map((h, i) => ({
      kind: "rolled" as const,
      id: p.id,
      won: h.won,
      voided: false,
      staked: h.staked,
      returned: h.returned,
      bankroll: h.bankroll,
      at: Date.now() - (p.history.length - i) * 60_000,
    })),
  );

  return { positions, balance, decimals: COLLATERAL_DECIMALS, feed, error, refresh };
}
