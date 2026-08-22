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
  history: Array<{ marketId: string; staked: string; returned: string; bankroll: string; won: boolean }>;
}

export type RollerEvent =
  | { kind: "opened"; id: number; at: number }
  | { kind: "entered"; id: number; marketId: string; price: number; symbol: string; secondsLeft: number; at: number }
  | { kind: "rolled"; id: number; won: boolean; voided: boolean; staked: string; returned: string; bankroll: string; at: number }
  | { kind: "closed"; id: number; reason: string; at: number }
  | { kind: "note"; id: number; text: string; at: number };

export interface Snapshot {
  live: boolean;
  decimals: number;
  positions: Position[];
  feed: RollerEvent[];
}
