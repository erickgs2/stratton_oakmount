export interface AgentRequestPreview {
  symbol: string;
  market: 'MX' | 'USA';
  readable: {
    lastPrice: number;
    changePct: number;
    volume: number;
    currency: string;
    rsi14: number;
    ma20: number;
    ma50: number;
    percentChange5d: number;
    volumeRatio: number;
    capitalLimit: number | null;
    intervalMin: number;
    availableFunds: number;
    effectiveCapital: number;
    netLiquidation: number;
    totalUnrealizedPnl: number;
    currentPosition: number;
    currentAvgCost: number;
  };
  request: {
    model: string;
    max_tokens: number;
    system: string;
    messages: { role: string; content: string }[];
  };
}
