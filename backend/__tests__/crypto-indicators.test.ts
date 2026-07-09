import {
  calculatePriceChangeSinceSnapshot,
  calculatePriceChangeSinceLastCycle,
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

  it('anchors to the OLDEST snapshot when several are in the window', () => {
    const threeHoursAgo = new Date(Date.now() - 180 * 60_000);
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
    // ascending order, as the caller (bitso-market-data.ts) always provides
    const result = calculatePriceChangeSinceSnapshot(1000, [
      { price: 900, recordedAt: threeHoursAgo },
      { price: 990, recordedAt: fiveMinAgo },
    ]);
    expect(result!.changePct).toBeCloseTo(((1000 - 900) / 900) * 100, 5);
    expect(result!.minutesAgo).toBeCloseTo(180, 0);
  });
});

describe('calculatePriceChangeSinceLastCycle', () => {
  it('returns null when there are no snapshots yet', () => {
    expect(calculatePriceChangeSinceLastCycle(100, [])).toBeNull();
  });

  it('anchors to the MOST RECENT snapshot when several are in the window', () => {
    const threeHoursAgo = new Date(Date.now() - 180 * 60_000);
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
    const result = calculatePriceChangeSinceLastCycle(1000, [
      { price: 900, recordedAt: threeHoursAgo },
      { price: 990, recordedAt: fiveMinAgo },
    ]);
    expect(result!.changePct).toBeCloseTo(((1000 - 990) / 990) * 100, 5);
    expect(result!.minutesAgo).toBeCloseTo(5, 0);
  });

  it('matches calculatePriceChangeSinceSnapshot when only one snapshot exists', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    const snapshots = [{ price: 1000, recordedAt: tenMinAgo }];
    const trend = calculatePriceChangeSinceSnapshot(950, snapshots);
    const sinceLastCycle = calculatePriceChangeSinceLastCycle(950, snapshots);
    expect(sinceLastCycle!.changePct).toBeCloseTo(trend!.changePct, 10);
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
    expect(result.changePctSinceLastCycle).toBeNull();
    expect(result.minutesSinceLastCycle).toBeNull();
    expect(result.orderBookImbalance).toBeCloseTo(0, 5);
    expect(result.spreadPct).toBeCloseTo(0.1998, 3);
  });

  it('reports both a medium-term trend and a distinct short-term last-cycle read', () => {
    const threeHoursAgo = new Date(Date.now() - 180 * 60_000);
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
    const result = calculateCryptoIndicators({
      currentPrice: 1000,
      snapshots: [
        { price: 900, recordedAt: threeHoursAgo },
        { price: 990, recordedAt: fiveMinAgo },
      ],
      bids: [{ price: 999, amount: 5 }],
      asks: [{ price: 1001, amount: 5 }],
    });
    // trend is anchored to the oldest snapshot (3h ago) — a real medium-term read
    expect(result.changePctSinceSnapshot).toBeCloseTo(((1000 - 900) / 900) * 100, 5);
    expect(result.minutesSinceSnapshot).toBeCloseTo(180, 0);
    // since-last-cycle is anchored to the most recent snapshot (5min ago) — distinct from trend
    expect(result.changePctSinceLastCycle).toBeCloseTo(((1000 - 990) / 990) * 100, 5);
    expect(result.minutesSinceLastCycle).toBeCloseTo(5, 0);
    expect(result.changePctSinceLastCycle).not.toBeCloseTo(result.changePctSinceSnapshot!, 2);
  });
});
