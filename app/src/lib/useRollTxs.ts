import { useEffect, useState } from "react";
import { shannon, VAULT } from "./chain";

/** keccak("PositionSettled(uint256,bytes32,uint256,uint256,uint256,bool)") —
 *  emitted once per completed roll, with the position id in topic1. */
const TOPIC_SETTLED = "0xcccebd2af630512f306870cbd499fabe219f8126db5d5d2139c59366d267693e";
/** Bounded so a vault with a long history cannot spin here forever. */
const MAX_PAGES = 6;

interface LogItem {
  topics: (string | null)[];
  transaction_hash: string;
  block_number: number;
}

/**
 *  Transaction hash for each roll of a position, oldest first.
 *
 *  The vault stores a bankroll ring, not hashes, and `eth_getLogs` on Somnia is
 *  capped at 1000 blocks — about 100 seconds — so a roll from an hour ago is
 *  unreachable over RPC. The explorer's own index is not capped, so that is
 *  where the history comes from.
 *
 *  Indexed by roll number: `hashes[n - 1]` is roll `n`. Returns an empty array
 *  on any failure, and every caller treats a missing hash as "no link" — the
 *  row still renders, it simply does not become a link.
 */
export function useRollTxs(positionId: number | null, rolls: number) {
  const [hashes, setHashes] = useState<string[]>([]);

  useEffect(() => {
    if (!VAULT || positionId === null || rolls === 0) {
      setHashes([]);
      return;
    }
    let alive = true;

    (async () => {
      const base = `${shannon.blockExplorers.default.url}/api/v2/addresses/${VAULT}/logs`;
      const idTopic = `0x${positionId.toString(16).padStart(64, "0")}`;
      const found: LogItem[] = [];
      let params = "";

      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await fetch(base + params);
        if (!res.ok) break;
        const body = await res.json();
        const items: LogItem[] = body.items ?? [];

        for (const item of items) {
          if (item.topics?.[0]?.toLowerCase() !== TOPIC_SETTLED) continue;
          if (item.topics?.[1]?.toLowerCase() !== idTopic) continue;
          found.push(item);
        }
        // Every settlement is on the page or earlier; stop as soon as we hold
        // the whole run rather than paging through the rest of the vault.
        if (found.length >= rolls || !body.next_page_params) break;
        params = "?" + new URLSearchParams(body.next_page_params).toString();
      }

      if (!alive) return;
      // The explorer returns newest first; roll numbers count up from the start.
      found.sort((a, b) => a.block_number - b.block_number);
      setHashes(found.map((f) => f.transaction_hash));
    })().catch(() => {
      // An explorer hiccup must never take the roll history down with it.
      if (alive) setHashes([]);
    });

    return () => {
      alive = false;
    };
  }, [positionId, rolls]);

  return hashes;
}
