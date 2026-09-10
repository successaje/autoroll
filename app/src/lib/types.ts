export interface Policy {
  maxRolls: number;
  maxLosses: number;
  takeProfitBps: number;
  sizeBps: number;
  compound: boolean;
  maxPrice: number;
}

export interface Position {
  id: number;
  asset: string;
  up: boolean;
  principal: string;
  bankroll: string;
  atRisk: string;
  rolls: number;
  losses: number;
  active: boolean;
  policy: Policy;
  marketId: string | null;
  quantity: string;
  history: Array<{
    marketId: string;
    staked: string;
    returned: string;
    bankroll: string;
    /** Net bankroll change for this roll. Set by the on-chain path, where the
     *  gross legs are not recoverable from the curve ring. */
    delta?: string;
    won: boolean;
  }>;
}

export type RollerEvent =
  | { kind: "opened"; id: number; at: number }
  | { kind: "entered"; id: number; marketId: string; price: number; symbol: string; secondsLeft: number; at: number }
  /**
   *  `staked`/`returned` are the gross legs of a roll and only the off-chain
   *  roller knows them. On chain the vault keeps a bounded ring of bankroll
   *  points, from which only the NET change per roll is recoverable — so that
   *  path sets `delta` and leaves the gross legs at "0". Render one or the
   *  other; never print an unknown gross leg as a zero.
   */
  | {
      kind: "rolled";
      id: number;
      won: boolean;
      voided: boolean;
      staked: string;
      returned: string;
      bankroll: string;
      delta?: string;
      at: number;
    }
  | { kind: "closed"; id: number; reason: string; at: number }
  | { kind: "note"; id: number; text: string; at: number };

export interface Snapshot {
  live: boolean;
  decimals: number;
  positions: Position[];
  feed: RollerEvent[];
}
