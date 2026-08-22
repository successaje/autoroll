import type { Policy } from "./types";

/** Mirrors src/policy.ts in the roller and `AutoRollVault.Policy` on chain. */
export const DEFAULT_POLICY: Policy = {
  maxRolls: 0,
  maxLosses: 4,
  takeProfitBps: 0,
  sizeBps: 2_000,
  compound: true,
  maxPrice: 0.65,
};

export const STREAK_POLICY: Policy = {
  maxRolls: 0,
  maxLosses: 1,
  takeProfitBps: 0,
  sizeBps: 10_000,
  compound: true,
  maxPrice: 0.9,
};
