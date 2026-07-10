import { Market } from './market.model';

export interface Trade {
  id: string;
  symbol: string;
  market: Market;
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  price: number;
  currency: 'MXN' | 'USD';
  reason: string;
  ibkrOrderId?: string;
  source?: 'agent' | 'manual';
  placedByEmail?: string | null;
  createdAt: string;
}
