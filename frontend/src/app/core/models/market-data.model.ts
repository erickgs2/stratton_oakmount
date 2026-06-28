export interface MarketDataPoint {
  date: string;
  close: number;
  volume: number;
}

export interface MXMarketData {
  symbol: string;
  lastPrice: number;
  changePct: number;
  volume: number;
  history: MarketDataPoint[];
}
