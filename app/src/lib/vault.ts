import { parseAbi } from "viem";
import { COLLATERAL, COLLATERAL_DECIMALS, VAULT, publicClient, shannon, walletClient } from "./chain";
import type { Policy, Position } from "./types";

export const vaultAbi = parseAbi([
  "struct Policy { uint32 maxRolls; uint32 maxLosses; uint64 takeProfitBps; uint32 sizeBps; uint64 maxPriceWad; bool compound; }",
  "function openPosition(bytes32 asset, bool up, uint256 stake, Policy policy) returns (uint256 id)",
  "function closePosition(uint256 id)",
  "function positionsOf(address user) view returns (uint256[])",
  "function equityOf(uint256 id) view returns (uint256)",
  "function curveOf(uint256 id) view returns (uint256[] bankrolls, bool[] won, uint256 firstRoll)",
  "function pokeFinalized(bytes32 marketId)",
  "function pokeCreated(bytes32 marketId, bytes32 asset)",
  "function inMarketCount(bytes32 marketId) view returns (uint256)",
  "function positions(uint256) view returns (address user, bytes32 asset, bool up, uint256 principal, uint256 bankroll, uint256 atRisk, uint256 quantity, uint32 rolls, uint32 losses, bool active, Policy policy)",
  "function pendingCount(bytes32 asset) view returns (uint256)",
  "function nextPositionId() view returns (uint256)",
  "event PositionOpened(uint256 indexed id, address indexed user, bytes32 asset, bool up, uint256 stake)",
  "event PositionRolled(uint256 indexed id, bytes32 indexed marketId, uint256 staked, uint32 rolls)",
  "event PositionSettled(uint256 indexed id, bytes32 indexed marketId, uint256 staked, uint256 returned, uint256 bankroll, bool won)",
  "event PositionClosed(uint256 indexed id, address indexed user, uint256 payout, string reason)",
]);

export const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function faucet(uint256 amount)",
]);

export async function readPositions(user: `0x${string}`): Promise<Position[]> {
  if (!VAULT) return [];
  const ids = await publicClient.readContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "positionsOf",
    args: [user],
  });

  const rows = await Promise.all(
    ids.map((id) =>
      publicClient.readContract({ address: VAULT!, abi: vaultAbi, functionName: "positions", args: [id] }),
    ),
  );

  return rows.map((r, i) => {
    const [, asset, up, principal, bankroll, atRisk, quantity, rolls, losses, active, policy] = r;
    return {
      id: Number(ids[i]),
      asset: ASSET_NAMES[asset.toLowerCase()] ?? "—",
      up,
      principal: principal.toString(),
      bankroll: bankroll.toString(),
      atRisk: atRisk.toString(),
      rolls: Number(rolls),
      losses: Number(losses),
      active,
      policy: {
        maxRolls: Number(policy.maxRolls),
        maxLosses: Number(policy.maxLosses),
        takeProfitBps: Number(policy.takeProfitBps),
        sizeBps: Number(policy.sizeBps),
        compound: policy.compound,
        maxPrice: Number(policy.maxPriceWad) / 1e18,
      },
      marketId: atRisk > 0n ? ("0x" as `0x${string}`) : null,
      quantity: quantity.toString(),
      // Storage keeps only the current state; the curve comes from PositionSettled
      // logs, merged in by `readHistory`.
      history: [],
    } satisfies Position;
  });
}

/** keccak256 of the handful of tickers the venue lists, precomputed so the UI
 *  can label a position without a round trip. */
export const ASSET_IDS: Record<string, `0x${string}`> = {
  BTC: "0xe98e2830be1a7e4156d656a7505e65d08c67660dc618072422e9c78053c261e9",
  ETH: "0xaaaebeba3810b1e6b70781f14b2d72c1cb89c0b2b320c43bb67ff79f562f5ff4",
};

const ASSET_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(ASSET_IDS).map(([k, v]) => [v.toLowerCase(), k]),
);

export function toPolicyStruct(p: Policy) {
  return {
    maxRolls: p.maxRolls,
    maxLosses: p.maxLosses,
    takeProfitBps: BigInt(p.takeProfitBps),
    sizeBps: p.sizeBps,
    maxPriceWad: BigInt(Math.round(p.maxPrice * 1e18)),
    compound: p.compound,
  };
}

/**
 *  Approve-then-open. The allowance is checked first so a returning user signs
 *  once, not twice — approvals persist and re-approving an already-sufficient
 *  allowance is a wasted signature, which is exactly the friction this product
 *  exists to remove.
 */
export async function openPosition(
  account: `0x${string}`,
  asset: string,
  up: boolean,
  stakeHuman: number,
  policy: Policy,
  onStep?: (step: string) => void,
): Promise<`0x${string}`> {
  if (!VAULT) throw new Error("VITE_VAULT_ADDRESS is not set");
  const wallet = walletClient(account);
  const stake = BigInt(Math.round(stakeHuman * 10 ** COLLATERAL_DECIMALS));

  const allowance = await publicClient.readContract({
    address: COLLATERAL,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, VAULT],
  });

  if (allowance < stake) {
    onStep?.("Approving tUSDC…");
    const approveHash = await wallet.writeContract({
      address: COLLATERAL,
      abi: erc20Abi,
      functionName: "approve",
      args: [VAULT, stake],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  onStep?.("Opening position…");
  const hash = await wallet.writeContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "openPosition",
    args: [ASSET_IDS[asset], up, stake, toPolicyStruct(policy)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function closePosition(account: `0x${string}`, id: number): Promise<`0x${string}`> {
  if (!VAULT) throw new Error("VITE_VAULT_ADDRESS is not set");
  const wallet = walletClient(account);
  const hash = await wallet.writeContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "closePosition",
    args: [BigInt(id)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Top up from the TestUSDC faucet — testnet only, and the reason a judge can
 *  try the app without asking anyone for tokens. */
export async function faucet(account: `0x${string}`, amountHuman = 500): Promise<void> {
  const wallet = walletClient(account);
  const hash = await wallet.writeContract({
    address: COLLATERAL,
    abi: erc20Abi,
    functionName: "faucet",
    args: [BigInt(Math.round(amountHuman * 10 ** COLLATERAL_DECIMALS))],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

/**
 *  Bankroll history for one position — one `eth_call`, not a log scan.
 *
 *  Somnia caps `eth_getLogs` at 1000 blocks, which at 100ms blocks is 100 SECONDS
 *  of history. Reading `PositionSettled` would need dozens of paged requests for
 *  a position that has been rolling for an hour, and the count would keep
 *  growing. The vault keeps a bounded ring of the last 32 points instead, which
 *  is more than the chart shows anyway.
 */
export async function readHistory(
  id: number,
  /** Bankroll before the first recorded roll. The ring holds no point for it. */
  principal: bigint,
  /** Total rolls ever. Once this exceeds the ring size the oldest point's
   *  predecessor has been overwritten and its delta is genuinely unknowable. */
  rolls: number,
): Promise<Position["history"]> {
  if (!VAULT) return [];
  const [bankrolls, won] = await publicClient.readContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "curveOf",
    args: [BigInt(id)],
  });

  // Only the net change per roll survives in the ring: the stake leaves the
  // bankroll on entry and the payout comes back on settlement, and the ring
  // samples once, after both. For a loss that net IS the stake; for a win it is
  // the profit, not the gross return. Carry it as a delta and let the UI say so.
  const wrapped = rolls > bankrolls.length;
  return bankrolls.map((b, i) => {
    const prev = i > 0 ? bankrolls[i - 1] : wrapped ? null : principal;
    return {
      marketId: "",
      staked: "0",
      returned: "0",
      bankroll: b.toString(),
      delta: prev === null ? undefined : (b - prev).toString(),
      won: won[i],
    };
  });
}

export async function readBalance(account: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: COLLATERAL,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
}


/** keccak("PositionRolled(uint256,bytes32,uint256,uint32)") — topic2 is the
 *  market the position entered. */
const TOPIC_ROLLED = "0x85577a2f7c799f990d3cd76faa231656fda00599178083bfda685f816b6afe0e";

/**
 *  The market a position is currently exposed to.
 *
 *  The vault maps market → positions, not the reverse, so this comes from the
 *  position's own last PositionRolled log. The explorer index rather than
 *  `eth_getLogs`, because a position can sit in a settled window for days and
 *  the RPC log window is about 100 seconds.
 */
export async function findCurrentMarket(positionId: number): Promise<`0x${string}` | null> {
  if (!VAULT) return null;
  const idTopic = `0x${positionId.toString(16).padStart(64, "0")}`;
  const url = `${shannon.blockExplorers.default.url}/api/v2/addresses/${VAULT}/logs`;
  let params = "";
  for (let page = 0; page < 6; page++) {
    const res = await fetch(url + params);
    if (!res.ok) return null;
    const body = await res.json();
    for (const item of body.items ?? []) {
      const [t0, t1, t2] = (item.topics ?? []) as (string | null)[];
      if (t0?.toLowerCase() === TOPIC_ROLLED && t1?.toLowerCase() === idTopic && t2) {
        return t2 as `0x${string}`;
      }
    }
    if (!body.next_page_params) return null;
    params = "?" + new URLSearchParams(body.next_page_params).toString();
  }
  return null;
}

/**
 *  Settle a position that is stranded in an expired window.
 *
 *  `pokeFinalized` is permissionless by design, which until now was only a
 *  claim on the status page. This makes it an action: when the keeper dies,
 *  anybody holding a wallet can redeem the stranded window and return the
 *  position to its queue, without being the position's owner.
 */
export async function resumePosition(
  account: `0x${string}`,
  positionId: number,
): Promise<`0x${string}`> {
  if (!VAULT) throw new Error("VITE_VAULT_ADDRESS is not set");
  const marketId = await findCurrentMarket(positionId);
  if (!marketId) throw new Error("Could not find the window this position is in");

  const exposed = await publicClient.readContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "inMarketCount",
    args: [marketId],
  });
  if (exposed === 0n) throw new Error("That window has already been settled");

  const wallet = walletClient(account);
  const hash = await wallet.writeContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "pokeFinalized",
    args: [marketId],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
