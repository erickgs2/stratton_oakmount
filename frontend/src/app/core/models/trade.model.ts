export interface Trade {
  id: string;
  symbol: string;
  market: 'MX' | 'USA';
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  price: number;
  currency: 'MXN' | 'USD';
  reason: string;
  ibkrOrderId?: string;
  createdAt: string;
}
