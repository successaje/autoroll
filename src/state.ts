import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Position } from "./policy.js";

const FILE = process.env.AUTOROLL_STATE ?? ".autoroll-state.json";

/** Restart-safe position book. Deliberately a flat file: the roller is a
 *  stand-in for the vault's storage, and a crash mid-window must not lose
 *  which market we are exposed to. */
export function load(): Position[] {
  if (!existsSync(FILE)) return [];
  return JSON.parse(readFileSync(FILE, "utf8"), (k, v) =>
    k === "principal" || k === "bankroll" || k === "atRisk" || k === "quantity" ? BigInt(v) : v,
  );
}

export function save(positions: Position[]): void {
  writeFileSync(
    FILE,
    JSON.stringify(positions, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2),
  );
}
