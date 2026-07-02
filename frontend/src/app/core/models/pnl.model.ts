export interface DailyPnlSummary {
  date: string;
  realizedPnl: number;
  buys: number;
  sells: number;
  holds: number;
  outcome: 'win' | 'loss' | 'flat';
}

export interface PnlReport {
  market: 'MX' | 'USA';
  currency: string;
  currentSessionRealizedPnl: number;
  allTimeRealizedPnl: number;
  days: DailyPnlSummary[];
}
