import { useEffect, useState } from "react";
import { publicClient, shannon, VAULT } from "./chain";

/** keccak("PositionRolled(uint256,bytes32,uint256,uint32)") */
const TOPIC_ROLLED = "0x85577a2f7c799f990d3cd76faa231656fda00599178083bfda685f816b6afe0e";
/** keccak("PositionSettled(uint256,bytes32,uint256,uint256,uint256,bool)") */
const TOPIC_SETTLED = "0xcccebd2af630512f306870cbd499fabe219f8126db5d5d2139c59366d267693e";

/**
 *  The venue runs a 60-second and a 300-second series, and a window can go
 *  unfilled, so a few quiet minutes is normal. Beyond this something is wrong.
 */
const STALE_AFTER_S = 15 * 60;
const POLL_MS = 30_000;

export type Liveness =
  | { state: "checking" }
  /** A roll landed recently. The thing the product promises is happening. */
  | { state: "rolling"; lastRollAgoS: number }
  /** Quiet, but not long enough to be alarming. */
  | { state: "quiet"; lastRollAgoS: number }
  /** Nothing has happened for long enough that no driver is running. */
  | { state: "stalled"; lastRollAgoS: number }
  /** The vault has never rolled, so there is nothing to be stalled about. */
  | { state: "never" }
  /** We could not find out. Say so rather than guessing either way. */
  | { state: "unknown" };

/**
 *  Is anything actually driving the vault?
 *
 *  The whole promise is that positions keep rolling while nobody watches, and
 *  for eleven days this app told every visitor "AutoRoll active" on a position
 *  whose keeper had died the day after the showcase. A liveness claim has to be
 *  measured against the chain, never asserted by a flag that only means
 *  "not closed".
 *
 *  Measured from the vault's own last roll or settlement. The explorer index is
 *  the source because `eth_getLogs` on Somnia reaches back about 100 seconds —
 *  far too short to tell "quiet for a minute" from "dead for a week".
 */
export function useLiveness(): Liveness {
  const [liveness, setLiveness] = useState<Liveness>({ state: "checking" });

  useEffect(() => {
    if (!VAULT) {
      setLiveness({ state: "unknown" });
      return;
    }
    let alive = true;

    async function check() {
      try {
        const url = `${shannon.blockExplorers.default.url}/api/v2/addresses/${VAULT}/logs`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        const items: Array<{ topics: (string | null)[]; block_timestamp?: string }> =
          body.items ?? [];

        const roll = items.find((i) => {
          const t = i.topics?.[0]?.toLowerCase();
          return t === TOPIC_ROLLED || t === TOPIC_SETTLED;
        });
        if (!alive) return;

        if (!roll?.block_timestamp) {
          setLiveness({ state: "never" });
          return;
        }
        const agoS = Math.max(0, (Date.now() - Date.parse(roll.block_timestamp)) / 1000);
        setLiveness(
          agoS > STALE_AFTER_S
            ? { state: "stalled", lastRollAgoS: agoS }
            : agoS > 150
              ? { state: "quiet", lastRollAgoS: agoS }
              : { state: "rolling", lastRollAgoS: agoS },
        );
      } catch {
        // Never silently fall back to "fine" — an unreachable explorer is not
        // evidence that rolling is healthy.
        if (alive) setLiveness((prev) => (prev.state === "checking" ? { state: "unknown" } : prev));
      }
    }

    void check();
    const t = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return liveness;
}

/** "4 minutes", "11 days" — for sentences, so no abbreviations. */
export function humanAgo(seconds: number): string {
  const units: Array<[number, string]> = [
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return `${n} ${name}${n === 1 ? "" : "s"}`;
    }
  }
  return "less than a minute";
}

/** Suppress the per-position "active" claim unless something is really driving it. */
export function isDriven(l: Liveness) {
  return l.state === "rolling" || l.state === "quiet";
}

export { publicClient };
