import { bitsoClient } from '@/lib/bitso';
import { prisma } from '@/lib/prisma';
import { calculateCryptoIndicators, CryptoIndicators } from '@/lib/crypto-indicators';

export interface CryptoMarketData {
  lastPrice: number;
  changePct24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  indicators: CryptoIndicators;
}

const SNAPSHOT_LOOKBACK_MIN = 60;

export async function getCryptoMarketData(book: string): Promise<CryptoMarketData> {
  const [ticker, orderBook] = await Promise.all([
    bitsoClient.getTicker(book),
    bitsoClient.getOrderBook(book),
  ]);

  const since = new Date(Date.now() - SNAPSHOT_LOOKBACK_MIN * 60_000);
  const snapshots = await prisma.cryptoPriceSnapshot.findMany({
    where: { book, recordedAt: { gte: since } },
    orderBy: { recordedAt: 'asc' },
  });

  const indicators = calculateCryptoIndicators({
    currentPrice: ticker.last,
    snapshots,
    bids: orderBook.bids,
    asks: orderBook.asks,
  });

  const previousPrice = ticker.last - ticker.change24;
  const changePct24h = previousPrice !== 0 ? (ticker.change24 / previousPrice) * 100 : 0;

  return {
    lastPrice: ticker.last,
    changePct24h,
    volume24h: ticker.volume,
    high24h: ticker.high,
    low24h: ticker.low,
    indicators,
  };
}

// Record this cycle's price for future cycles' "since last check" comparison
// — the crypto equivalent of recordLastPrice in trading-context.ts, kept in
// its own table since crypto never touches trading-context.ts (see plan
// Global Constraints). Mutating, so it is called only from the real
// runCryptoAgentCycle — never from getCryptoMarketData / previewCryptoAgentRequest,
// which must stay read-only (mirrors peekLastPrice/recordLastPrice in trading-context.ts).
export async function recordCryptoPriceSnapshot(book: string, price: number): Promise<void> {
  await prisma.cryptoPriceSnapshot.create({ data: { book, price } });
}
