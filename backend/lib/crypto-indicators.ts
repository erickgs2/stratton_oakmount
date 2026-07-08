export interface CryptoIndicators {
  changePctSinceSnapshot: number | null;
  minutesSinceSnapshot: number | null;
  orderBookImbalance: number;
  spreadPct: number;
}

export interface PriceSnapshotInput {
  price: number;
  recordedAt: Date;
}

export interface OrderBookLevel {
  price: number;
  amount: number;
}

// Caller passes snapshots ordered oldest-first (ascending recordedAt); the
// oldest one within the lookback window anchors the "since last check" read.
export function calculatePriceChangeSinceSnapshot(
  currentPrice: number,
  snapshots: PriceSnapshotInput[],
): { changePct: number; minutesAgo: number } | null {
  if (snapshots.length === 0) return null;
  const oldest = snapshots[0];
  if (oldest.price === 0) return null;
  const changePct = ((currentPrice - oldest.price) / oldest.price) * 100;
  const minutesAgo = (Date.now() - oldest.recordedAt.getTime()) / 60_000;
  return { changePct, minutesAgo };
}

export function calculateOrderBookImbalance(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
  depth: number = 10,
): number {
  const bidVolume = bids.slice(0, depth).reduce((sum, level) => sum + level.amount, 0);
  const askVolume = asks.slice(0, depth).reduce((sum, level) => sum + level.amount, 0);
  const total = bidVolume + askVolume;
  if (total === 0) return 0;
  return (bidVolume - askVolume) / total;
}

export function calculateSpreadPct(bestBid: number, bestAsk: number): number {
  if (bestAsk === 0) return 0;
  return ((bestAsk - bestBid) / bestAsk) * 100;
}

export function calculateCryptoIndicators(params: {
  currentPrice: number;
  snapshots: PriceSnapshotInput[];
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}): CryptoIndicators {
  const priceChange = calculatePriceChangeSinceSnapshot(params.currentPrice, params.snapshots);
  const bestBid = params.bids[0]?.price ?? 0;
  const bestAsk = params.asks[0]?.price ?? 0;
  return {
    changePctSinceSnapshot: priceChange?.changePct ?? null,
    minutesSinceSnapshot: priceChange?.minutesAgo ?? null,
    orderBookImbalance: calculateOrderBookImbalance(params.bids, params.asks),
    spreadPct: calculateSpreadPct(bestBid, bestAsk),
  };
}
