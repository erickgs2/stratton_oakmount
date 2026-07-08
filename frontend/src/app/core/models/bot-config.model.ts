import { Market } from './market.model';

export interface BotConfig {
  id: string;
  market: Market;
  symbols: string[];
  capitalLimit: number;
  intervalMin: number;
  confidenceThreshold: number;
  takeProfitPct: number;
  stopLossPct: number;
  feeEstimatePct: number;
  isActive: boolean;
  updatedAt: string;
}
