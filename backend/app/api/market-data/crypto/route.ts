import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { bitsoClient } from '@/lib/bitso';

export const dynamic = 'force-dynamic';

// Bitso has no historical OHLC endpoint — the only "history" available is
// whatever CryptoPriceSnapshot rows the bot has recorded on its own, one
// per real trading cycle. Capped to a recent window rather than unbounded
// "since the beginning of time" as the table has no retention/pruning yet.
const LOOKBACK_DAYS = 7;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'symbol query param is required' }, { status: 400 });
  }

  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const [ticker, snapshots] = await Promise.all([
      bitsoClient.getTicker(symbol),
      prisma.cryptoPriceSnapshot.findMany({
        where: { book: symbol, recordedAt: { gte: since } },
        orderBy: { recordedAt: 'asc' },
      }),
    ]);

    const previousPrice = ticker.last - ticker.change24;
    const changePct = previousPrice !== 0 ? (ticker.change24 / previousPrice) * 100 : 0;

    return NextResponse.json({
      symbol,
      lastPrice: ticker.last,
      changePct,
      volume: ticker.volume,
      // Reuses the same { date, close, volume } shape the MX/USA market-data
      // routes return — SymbolChartComponent's rendering only ever reads
      // `.close` (index-spaced on the x-axis) and never reads per-point
      // volume, so no crypto-specific model/component was needed.
      history: snapshots.map(s => ({
        date: s.recordedAt.toISOString(),
        close: s.price,
        volume: 0,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
