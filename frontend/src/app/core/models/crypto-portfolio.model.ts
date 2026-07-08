export interface CryptoPosition {
  book: string;
  baseCurrency: string;
  quantity: number;
  lastPrice: number;
  mktValue: number;
}

export interface CryptoPortfolio {
  currency: 'MXN';
  availableFunds: number;
  netLiquidation: number;
  positions: CryptoPosition[];
}
