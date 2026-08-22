/**
 *  The roll policy — deliberately expressed in terms a UI can render as sliders,
 *  and kept byte-for-byte equivalent to `AutoRollVault.Policy` / `_stopReason`
 *  so the off-chain roller and the on-chain vault make identical decisions.
 */
export interface Policy {
  /** Stop after this many windows. 0 = unlimited. */
  maxRolls: number;
  /** Stop after this many consecutive losing windows. 0 = never. */
  maxLosses: number;
  /** Stop once stake >= principal * (1 + bps/10_000). 0 = never. */
  takeProfitBps: number;
  /** Never pay more than this Up-probability for the side we want (0..1). */
  maxPrice: number;
  /** Roll the whole balance, or re-stake the original principal each window. */
  compound: boolean;
}

export const DEFAULT_POLICY: Policy = {
  maxRolls: 0,
  maxLosses: 3,
  takeProfitBps: 0,
  maxPrice: 0.65,
  compound: true,
};

/** Streak mode: let it compound until it dies. A parlay with no house edge,
 *  which is only honest because dreamDEX's fees really are zero. */
export const STREAK_POLICY: Policy = {
  maxRolls: 0,
  maxLosses: 1,
  takeProfitBps: 0,
  maxPrice: 0.9,
  compound: true,
};

export interface Position {
  id: number;
  asset: string; // "BTC" | "ETH"
  up: boolean;
  /** Raw collateral units (market decimals), as deposited. */
  principal: bigint;
  /** Raw collateral units currently working. */
  stake: bigint;
  rolls: number;
  losses: number;
  active: boolean;
  policy: Policy;
  /** The window we are currently exposed to, if any. */
  marketId: `0x${string}` | null;
  /** Outcome tokens we hold in `marketId` (raw), pending redemption. */
  quantity: bigint;
  history: Array<{ marketId: string; stakeIn: string; stakeOut: string; won: boolean }>;
}

/** Mirrors `AutoRollVault._stopReason`. Returns null to keep rolling. */
export function stopReason(p: Position): string | null {
  if (p.policy.maxRolls !== 0 && p.rolls >= p.policy.maxRolls) return "max-rolls";
  if (p.policy.maxLosses !== 0 && p.losses >= p.policy.maxLosses) return "stop-loss";
  if (p.stake === 0n) return "wiped";
  if (p.policy.takeProfitBps !== 0) {
    const target = p.principal + (p.principal * BigInt(p.policy.takeProfitBps)) / 10_000n;
    if (p.stake >= target) return "take-profit";
  }
  return null;
}
