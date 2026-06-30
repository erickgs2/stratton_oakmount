export interface Order {
  orderId: number;
  ticker: string;
  side: 'BUY' | 'SELL';
  orderType: string;
  totalSize: number;
  filledQuantity: number;
  remainingQuantity: number;
  status: string;
  price?: number;
  listingExchange?: string;
  timeInForce?: string;
}
