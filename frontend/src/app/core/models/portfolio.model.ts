export interface Position {
  conid: number;
  ticker: string;
  position: number;
  avgCost: number;
  mktValue: number;
  unrealizedPnl: number;
}

export interface AccountSummary {
  availableFunds: number;
  buyingPower: number;
  currency: string;
  totalCashValue: number;
  netLiquidation: number;
}

export interface Portfolio {
  positions: Position[];
  summary: AccountSummary;
}
