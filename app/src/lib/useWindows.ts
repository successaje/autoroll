import { useEffect, useRef, useState } from "react";
import { publicClient } from "./chain";

/** The BinaryMarketsModule. Same address the vault and the keeper watch. */
const MODULE = "0x3ecC694Cef705358864a646142ac17A90E29e388" as const;
const TOPIC_CREATED = "0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd" as const;
const TOPIC_FINALIZED = "0x8f396ac6cf2e01887362e2b39d8e56860042c604e5b1b481c87e6d9f90006e08" as const;

export interface WindowEvent {
  kind: "opened" | "expired";
  marketId: `0x${string}`;
  at: number;
}

/**
 *  Live dreamDEX windows, straight from the chain, with no wallet involved.
 *
 *  This is the landing page's whole argument: every one of these is a contract
 *  that just died and took its holders' positions with it. The counter is not a
 *  marketing number — it is real settlements, happening while the page is open.
 *
 *  Somnia caps `eth_getLogs` at 1000 blocks, which at 100ms blocks is 100
 *  seconds of history, so the cursor has to keep up rather than ever look back.
 */
export function useWindows(enabled = true) {
  const [events, setEvents] = useState<WindowEvent[]>([]);
  const [expired, setExpired] = useState(0);
  const [opened, setOpened] = useState(0);
  const [connected, setConnected] = useState(false);
  /** Expiries in the ~90s before arrival. Shown only until the live count moves,
   *  so the page never opens on a zero that argues against the product. */
  const [seeded, setSeeded] = useState(0);
  const cursor = useRef<bigint | null>(null);
  /** A tick that outlives its interval would read the same cursor as the next
   *  one, refetch the same range and double-count it. One at a time. */
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    async function tick() {
      if (busy.current) return;
      busy.current = true;
      try {
        const head = await publicClient.getBlockNumber();
        if (!alive) return;
        setConnected(true);

        if (cursor.current === null) {
          cursor.current = head;
          // Seed the LIST from recent history so the page looks alive on arrival,
          // but not the COUNTER — that one has to mean "since you got here" or it
          // is just a number we made up.
          try {
            const back = head > 900n ? head - 900n : 0n;
            const seed = await publicClient.getLogs({ address: MODULE, fromBlock: back, toBlock: head });
            if (!alive) return;
            const mapped = seed
              .map((l) => {
                const [t0, marketId] = l.topics as [`0x${string}`, `0x${string}` | undefined];
                if (!marketId) return null;
                if (t0 === TOPIC_CREATED) return { kind: "opened" as const, marketId, at: 0 };
                if (t0 === TOPIC_FINALIZED) return { kind: "expired" as const, marketId, at: 0 };
                return null;
              })
              .filter((e): e is WindowEvent => e !== null)
              .reverse()
              .slice(0, 8);
            setEvents(mapped);
            setSeeded(mapped.filter((e) => e.kind === "expired").length);
          } catch {
            /* the seed is a nicety; the live stream is the point */
          }
          return;
        }
        if (head <= cursor.current) return;

        const from = head - cursor.current > 900n ? head - 900n : cursor.current + 1n;
        const logs = await publicClient.getLogs({ address: MODULE, fromBlock: from, toBlock: head });
        cursor.current = head;
        if (!alive || logs.length === 0) return;

        const fresh: WindowEvent[] = [];
        let nExpired = 0;
        let nOpened = 0;
        for (const l of logs) {
          const [t0, marketId] = l.topics as [`0x${string}`, `0x${string}` | undefined];
          if (!marketId) continue;
          if (t0 === TOPIC_CREATED) {
            nOpened++;
            fresh.push({ kind: "opened", marketId, at: Date.now() });
          } else if (t0 === TOPIC_FINALIZED) {
            nExpired++;
            fresh.push({ kind: "expired", marketId, at: Date.now() });
          }
        }
        if (fresh.length === 0) return;
        setExpired((n) => n + nExpired);
        setOpened((n) => n + nOpened);
        setEvents((prev) => [...fresh, ...prev].slice(0, 8));
      } catch {
        setConnected(false); // a dropped poll is not worth surfacing; the next one retries
      } finally {
        busy.current = false;
      }
    }

    void tick();
    const t = setInterval(tick, 3_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);

  return { events, expired, opened, connected, seeded };
}
