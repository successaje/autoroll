import { useEffect, useState } from "react";
import { publicClient, shannon, VAULT } from "./chain";
import { vaultAbi } from "./vault";

/** keccak("PositionSettled(uint256,bytes32,uint256,uint256,uint256,bool)") */
const TOPIC_SETTLED = "0xcccebd2af630512f306870cbd499fabe219f8126db5d5d2139c59366d267693e";
const MAX_PAGES = 14;

export interface VaultStats {
  positions: number;
  /** Positions that finished above what they started with. */
  up: number;
  /** Sum of every principal ever deposited, in collateral units. */
  capitalIn: bigint;
  /** Final balance for finished runs plus live equity for open ones. */
  capitalOut: bigint;
  /** Settlements counted from events, not from the curve ring — the ring holds
   *  the last 32 points per position, so a long run would be under-sampled. */
  settled: number;
  wins: number;
  /** A win returns quantity x 1.0, so staked/returned is the price paid. */
  avgEntryPrice: number | null;
  /** Did the settlement sample hit the page cap? Then it is a recent sample
   *  rather than the whole history, and the UI should say so. */
  sampleTruncated: boolean;
  loading: boolean;
}

/**
 *  How the vault has actually done, across every position in it.
 *
 *  The portfolio used to lead with whichever run looked best. One position
 *  finished +19.2%; the vault as a whole is down. Showing the first without
 *  the second is the kind of thing that reads as a lie the moment somebody
 *  checks, and everything here is on a public chain, so somebody will.
 */
export function useVaultStats(): VaultStats {
  const [stats, setStats] = useState<VaultStats>({
    positions: 0, up: 0, capitalIn: 0n, capitalOut: 0n,
    settled: 0, wins: 0, avgEntryPrice: null, sampleTruncated: false, loading: true,
  });

  useEffect(() => {
    if (!VAULT) return;
    let alive = true;

    (async () => {
      const next = (await publicClient.readContract({
        address: VAULT, abi: vaultAbi, functionName: "nextPositionId",
      })) as bigint;

      /*  One round trip per position, all in flight together. Sequentially
       *  this was fifteen seconds of staring at nothing before the first
       *  number appeared. */
      const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1));
      const rows = await Promise.all(
        ids.map(async (id) => {
          const p = (await publicClient.readContract({
            address: VAULT!, abi: vaultAbi, functionName: "positions", args: [id],
          })) as readonly unknown[];
          const principal = p[3] as bigint;
          if (principal === 0n) return null;
          if (p[9] as boolean) {
            return { principal, final: (p[4] as bigint) + (p[5] as bigint) };
          }
          const [bank] = (await publicClient.readContract({
            address: VAULT!, abi: vaultAbi, functionName: "curveOf", args: [id],
          })) as [bigint[], boolean[], bigint];
          return { principal, final: bank.length ? bank[bank.length - 1] : principal };
        }),
      );
      if (!alive) return;

      let capitalIn = 0n, capitalOut = 0n, positions = 0, up = 0;
      for (const row of rows) {
        if (!row) continue;
        positions++;
        capitalIn += row.principal;
        capitalOut += row.final;
        if (row.final > row.principal) up++;
      }

      /*  Show the capital figures now. The settlement sample is paginated and
       *  cursor-based, so it cannot be parallelised and takes a further ten
       *  seconds or so — no reason to withhold the headline until it lands. */
      setStats((prev) => ({
        ...prev, positions, up, capitalIn, capitalOut, loading: false,
      }));

      let wins = 0, settled = 0, priceSum = 0, priced = 0, truncated = false;
      try {
        let params = "";
        let page = 0;
        for (; page < MAX_PAGES; page++) {
          const res = await fetch(
            `${shannon.blockExplorers.default.url}/api/v2/addresses/${VAULT}/logs${params}`,
          );
          if (!res.ok) break;
          const body = await res.json();
          for (const item of body.items ?? []) {
            if (item.topics?.[0]?.toLowerCase() !== TOPIC_SETTLED) continue;
            const d = (item.data as string).slice(2);
            const word = (n: number) => BigInt("0x" + d.slice(n * 64, (n + 1) * 64));
            const staked = Number(word(0));
            const returned = Number(word(1));
            settled++;
            if (word(3) === 1n) {
              wins++;
              if (returned > 0) { priceSum += staked / returned; priced++; }
            }
          }
          if (!body.next_page_params) break;
          params = "?" + new URLSearchParams(body.next_page_params).toString();
        }
        truncated = page >= MAX_PAGES;
      } catch {
        // Capital figures are on-chain and stand on their own; the win rate
        // simply does not render.
      }
      if (!alive) return;

      setStats((prev) => ({
        ...prev, settled, wins,
        avgEntryPrice: priced ? priceSum / priced : null,
        sampleTruncated: truncated,
      }));
    })().catch(() => alive && setStats((s) => ({ ...s, loading: false })));

    return () => { alive = false; };
  }, []);

  return stats;
}
