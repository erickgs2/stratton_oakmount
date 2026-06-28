export interface Indicators {
  rsi14: number;
  ma20: number;
  ma50: number;
  percentChange5d: number;
  volumeRatio: number;
}

export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  const changes = prices.slice(1).map((price, i) => price - prices[i]);
  const gains = changes.map(c => (c > 0 ? c : 0));
  const losses = changes.map(c => (c < 0 ? -c : 0));

  if (gains.every(g => g === 0) && losses.every(l => l === 0)) return 50;

  // Wilder's smoothed moving average
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  const slice = prices.length < period ? prices : prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function calculatePercentChange(prices: number[], days: number): number {
  if (prices.length < days + 1) return 0;
  const current = prices[prices.length - 1];
  const past = prices[prices.length - 1 - days];
  if (past === 0) return 0;
  return ((current - past) / past) * 100;
}

export function calculateVolumeRatio(volumes: number[], period: number = 20): number {
  if (volumes.length < period + 1) return 1;
  const current = volumes[volumes.length - 1];
  const historical = volumes.slice(-period - 1, -1);
  const avg = historical.reduce((a, b) => a + b, 0) / historical.length;
  return avg === 0 ? 1 : current / avg;
}

export function calculateIndicators(
  closePrices: number[],
  volumes: number[]
): Indicators {
  return {
    rsi14: calculateRSI(closePrices, 14),
    ma20: calculateMA(closePrices, 20),
    ma50: calculateMA(closePrices, 50),
    percentChange5d: calculatePercentChange(closePrices, 5),
    volumeRatio: calculateVolumeRatio(volumes, 20),
  };
}
