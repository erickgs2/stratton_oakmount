import {
  calculatePriceChangeSinceSnapshot,
  calculateOrderBookImbalance,
  calculateSpreadPct,
  calculateCryptoIndicators,
} from '@/lib/crypto-indicators';

describe('calculatePriceChangeSinceSnapshot', () => {
  it('returns null when there are no snapshots yet', () => {
    expect(calculatePriceChangeSinceSnapshot(100, [])).toBeNull();
  });

  it('computes positive percent change from the oldest snapshot', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000);
    const result = calculatePriceChangeSinceSnapshot(1100, [{ price: 1000, recordedAt: thirtyMinAgo }]);
    expect(result).not.toBeNull();
    expect(result!.changePct).toBeCloseTo(10, 5);
    expect(result!.minutesAgo).toBeCloseTo(30, 0);
  });

  it('computes negative percent change', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    const result = calculatePriceChangeSinceSnapshot(950, [{ price: 1000, recordedAt: tenMinAgo }]);
    expect(result!.changePct).toBeCloseTo(-5, 5);
  });
});

describe('calculateOrderBookImbalance', () => {
  it('returns 0 for an empty book', () => {
    expect(calculateOrderBookImbalance([], [])).toBe(0);
  });

  it('returns a positive value when bid volume dominates', () => {
    const bids = [{ price: 100, amount: 8 }];
    const asks = [{ price: 101, amount: 2 }];
    expect(calculateOrderBookImbalance(bids, asks)).toBeCloseTo(0.6, 5); // (8-2)/10
  });

  it('returns a negative value when ask volume dominates', () => {
    const bids = [{ price: 100, amount: 2 }];
    const asks = [{ price: 101, amount: 8 }];
    expect(calculateOrderBookImbalance(bids, asks)).toBeCloseTo(-0.6, 5);
  });

  it('only considers the top N levels given by depth', () => {
    const bids = [{ price: 100, amount: 5 }, { price: 99, amount: 100 }];
    const asks = [{ price: 101, amount: 5 }];
    expect(calculateOrderBookImbalance(bids, asks, 1)).toBeCloseTo(0, 5); // 5 vs 5, ignoring the 100
  });
});

describe('calculateSpreadPct', () => {
  it('computes spread as a percent of the ask price', () => {
    expect(calculateSpreadPct(99, 100)).toBeCloseTo(1, 5);
  });

  it('returns 0 when ask is 0', () => {
    expect(calculateSpreadPct(0, 0)).toBe(0);
  });
});

describe('calculateCryptoIndicators', () => {
  it('combines all sub-indicators, tolerating an empty snapshot history', () => {
    const result = calculateCryptoIndicators({
      currentPrice: 1000,
      snapshots: [],
      bids: [{ price: 999, amount: 5 }],
      asks: [{ price: 1001, amount: 5 }],
    });
    expect(result.changePctSinceSnapshot).toBeNull();
    expect(result.minutesSinceSnapshot).toBeNull();
    expect(result.orderBookImbalance).toBeCloseTo(0, 5);
    expect(result.spreadPct).toBeCloseTo(0.1998, 3);
  });
});
