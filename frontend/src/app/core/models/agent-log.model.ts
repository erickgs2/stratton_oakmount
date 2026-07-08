export interface AgentLogIndicators {
  rsi14: number;
  ma20: number;
  ma50: number;
  percentChange5d: number;
  volumeRatio: number;
}

export interface CryptoAgentLogIndicators {
  changePctSinceSnapshot: number | null;
  minutesSinceSnapshot: number | null;
  orderBookImbalance: number;
  spreadPct: number;
}

export interface AgentLogMarketData {
  lastPrice: number;
  changePct?: number;
  volume?: number;
  indicators: AgentLogIndicators | CryptoAgentLogIndicators;
}

export interface AgentLogResponse {
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  confidence: number;
  reason: string;
}

export interface AgentLog {
  id: string;
  createdAt: string;
  symbol: string;
  market: string;
  executed: boolean;
  marketData: AgentLogMarketData;
  response: AgentLogResponse;
}
