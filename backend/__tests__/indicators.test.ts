import {
  calculateRSI,
  calculateMA,
  calculatePercentChange,
  calculateVolumeRatio,
  calculateIndicators,
} from '@/lib/indicators';

describe('calculateRSI', () => {
  it('returns 100 when all price changes are gains', () => {
    const prices = Array.from({ length: 16 }, (_, i) => 10 + i); // 10,11,12,...,25
    expect(calculateRSI(prices, 14)).toBe(100);
  });

  it('returns 0 when all price changes are losses', () => {
    const prices = Array.from({ length: 16 }, (_, i) => 25 - i); // 25,24,23,...,10
    expect(calculateRSI(prices, 14)).toBe(0);
  });

  it('returns 50 for neutral neutral price (no change)', () => {
    const prices = new Array(16).fill(100); // flat prices
    // avgLoss = 0, avgGain = 0 → RSI = 50 by convention
    expect(calculateRSI(prices, 14)).toBe(50);
  });

  it('returns value between 0 and 100 for mixed prices', () => {
    const prices = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.15,
                    43.61, 44.33, 44.83, 45.10, 45.15, 43.61, 44.33];
    const rsi = calculateRSI(prices, 14);
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(100);
  });

  it('returns 50 when insufficient data (less than period + 1 prices)', () => {
    expect(calculateRSI([100, 101, 102], 14)).toBe(50);
  });
});

describe('calculateMA', () => {
  it('returns the average of the last N prices', () => {
    const prices = [10, 20, 30, 40, 50];
    expect(calculateMA(prices, 3)).toBeCloseTo(40, 5); // avg of [30,40,50]
  });

  it('uses all prices when fewer than period', () => {
    const prices = [10, 20, 30];
    expect(calculateMA(prices, 5)).toBeCloseTo(20, 5); // avg of all 3
  });

  it('returns the single price when array has one element', () => {
    expect(calculateMA([42], 5)).toBe(42);
  });
});

describe('calculatePercentChange', () => {
  it('calculates 5-day percent change correctly', () => {
    const prices = [100, 102, 101, 103, 104, 110];
    // (110 - 100) / 100 * 100 = 10%
    expect(calculatePercentChange(prices, 5)).toBeCloseTo(10, 5);
  });

  it('returns 0 when not enough prices', () => {
    expect(calculatePercentChange([100, 102], 5)).toBe(0);
  });

  it('handles negative change', () => {
    const prices = [110, 108, 106, 104, 102, 100];
    expect(calculatePercentChange(prices, 5)).toBeCloseTo(-9.09, 1);
  });
});

describe('calculateVolumeRatio', () => {
  it('returns 2 when current volume is double the average', () => {
    const volumes = [...new Array(20).fill(100), 200]; // 20 days of 100, then 200
    expect(calculateVolumeRatio(volumes, 20)).toBeCloseTo(2, 5);
  });

  it('returns 1 when insufficient data', () => {
    expect(calculateVolumeRatio([100, 200], 20)).toBe(1);
  });
});

describe('calculateIndicators', () => {
  it('returns all indicator fields', () => {
    const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i) * 10);
    const volumes = new Array(60).fill(1_000_000);
    const result = calculateIndicators(prices, volumes);

    expect(result).toHaveProperty('rsi14');
    expect(result).toHaveProperty('ma20');
    expect(result).toHaveProperty('ma50');
    expect(result).toHaveProperty('percentChange5d');
    expect(result).toHaveProperty('volumeRatio');
    expect(typeof result.rsi14).toBe('number');
  });
});
