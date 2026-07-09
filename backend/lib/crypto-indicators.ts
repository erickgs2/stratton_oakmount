export interface CryptoIndicators {
  changePctSinceSnapshot: number | null;
  minutesSinceSnapshot: number | null;
  changePctSinceLastCycle: number | null;
  minutesSinceLastCycle: number | null;
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
// oldest one within the lookback window anchors this read. This is a
// medium-term "trend" read (the lookback window is several hours, not one
// cycle) — see calculatePriceChangeSinceLastCycle below for the short-term
// counterpart. Kept separate rather than merged because a single-cycle tick
// and a multi-hour trend answer different questions and get weighted very
// differently by the agent (a lone noisy tick should not drive a decision).
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

// Anchored to the most recent prior snapshot (last element of the
// ascending-sorted array) instead of the oldest one in the lookback window —
// the true "since the last cycle" read. When only one snapshot exists in the
// window, this equals calculatePriceChangeSinceSnapshot's result, which is
// expected (not enough history yet to tell short-term from trend).
export function calculatePriceChangeSinceLastCycle(
  currentPrice: number,
  snapshots: PriceSnapshotInput[],
): { changePct: number; minutesAgo: number } | null {
  if (snapshots.length === 0) return null;
  const mostRecent = snapshots[snapshots.length - 1];
  if (mostRecent.price === 0) return null;
  const changePct = ((currentPrice - mostRecent.price) / mostRecent.price) * 100;
  const minutesAgo = (Date.now() - mostRecent.recordedAt.getTime()) / 60_000;
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
  const trend = calculatePriceChangeSinceSnapshot(params.currentPrice, params.snapshots);
  const sinceLastCycle = calculatePriceChangeSinceLastCycle(params.currentPrice, params.snapshots);
  const bestBid = params.bids[0]?.price ?? 0;
  const bestAsk = params.asks[0]?.price ?? 0;
  return {
    changePctSinceSnapshot: trend?.changePct ?? null,
    minutesSinceSnapshot: trend?.minutesAgo ?? null,
    changePctSinceLastCycle: sinceLastCycle?.changePct ?? null,
    minutesSinceLastCycle: sinceLastCycle?.minutesAgo ?? null,
    orderBookImbalance: calculateOrderBookImbalance(params.bids, params.asks),
    spreadPct: calculateSpreadPct(bestBid, bestAsk),
  };
}
