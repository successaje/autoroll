/**
 *  The roll policy — expressed in terms a UI can render as sliders, and kept
 *  equivalent to `AutoRollVault.Policy` / `_stopReason` so the off-chain roller
 *  and the on-chain vault make identical decisions on identical state.
 */
export interface Policy {
  /** Stop after this many windows. 0 = unlimited. */
  maxRolls: number;
  /** Stop after this many consecutive losing windows. 0 = never. */
  maxLosses: number;
  /** Stop once the bankroll reaches principal * (1 + bps/10_000). 0 = never. */
  takeProfitBps: number;
  /**
   *  How much of the bankroll goes into each window, in bps.
   *
   *  This is the parameter that decides whether the product is a position or a
   *  lottery ticket. A binary contract pays 0 on a loss, so betting the whole
   *  bankroll every window means the FIRST loss ends the run no matter what
   *  `maxLosses` says — the stop-loss can never fire. Staking a fraction is what
   *  makes a hundred-window roll survivable and makes the other stops mean
   *  something.
   */
  sizeBps: number;
  /** Size off the live bankroll (grows with wins), or off the original principal. */
  compound: boolean;
  /** Never pay more than this Up-probability for the side we want (0..1). */
  maxPrice: number;
}

export const DEFAULT_POLICY: Policy = {
  maxRolls: 0,
  maxLosses: 4,
  takeProfitBps: 0,
  sizeBps: 2_000, // 20% of the bankroll per window
  compound: true,
  maxPrice: 0.65,
};

/** Streak mode: the whole bankroll rides every window until one loss ends it.
 *  A parlay with no house edge — honest only because the venue's fees are zero. */
export const STREAK_POLICY: Policy = {
  maxRolls: 0,
  maxLosses: 1,
  takeProfitBps: 0,
  sizeBps: 10_000,
  compound: true,
  maxPrice: 0.9,
};

export interface Position {
  id: number;
  asset: string; // "BTC" | "ETH"
  up: boolean;
  /** Raw collateral units (market decimals), as deposited. */
  principal: bigint;
  /** Raw collateral units currently held — free funds plus whatever is at risk. */
  bankroll: bigint;
  /** Raw collateral units committed to the window we are currently in. */
  atRisk: bigint;
  rolls: number;
  losses: number;
  active: boolean;
  policy: Policy;
  /** The window we are currently exposed to, if any. */
  marketId: `0x${string}` | null;
  /** Outcome tokens we hold in `marketId` (raw), pending redemption. */
  quantity: bigint;
  history: Array<{ marketId: string; staked: string; returned: string; bankroll: string; won: boolean }>;
}

/** What the next window should cost, given the policy and where we stand. */
export function nextStake(p: Position): bigint {
  const base = p.policy.compound ? p.bankroll : p.principal;
  const size = (base * BigInt(p.policy.sizeBps)) / 10_000n;
  return size > p.bankroll ? p.bankroll : size;
}

/** Mirrors `AutoRollVault._stopReason`. Returns null to keep rolling. */
export function stopReason(p: Position): string | null {
  if (p.policy.maxRolls !== 0 && p.rolls >= p.policy.maxRolls) return "max-rolls";
  if (p.policy.maxLosses !== 0 && p.losses >= p.policy.maxLosses) return "stop-loss";
  if (nextStake(p) === 0n) return "wiped";
  if (p.policy.takeProfitBps !== 0) {
    const target = p.principal + (p.principal * BigInt(p.policy.takeProfitBps)) / 10_000n;
    if (p.bankroll >= target) return "take-profit";
  }
  return null;
}
