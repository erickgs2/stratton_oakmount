import { Market } from './market.model';

export interface DailyPnlSummary {
  date: string;
  realizedPnl: number;
  buys: number;
  sells: number;
  holds: number;
  outcome: 'win' | 'loss' | 'flat';
}

export interface PnlReport {
  market: Market;
  currency: string;
  currentSessionRealizedPnl: number;
  allTimeRealizedPnl: number;
  days: DailyPnlSummary[];
}
