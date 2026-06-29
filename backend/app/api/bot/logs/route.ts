import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const VALID_MARKETS = ['MX', 'USA'];
const VALID_LEVELS = ['info', 'warn', 'error'];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const rawMarket = searchParams.get('market');
  if (rawMarket && !VALID_MARKETS.includes(rawMarket)) {
    return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  }

  const rawLevel = searchParams.get('level');
  if (rawLevel && !VALID_LEVELS.includes(rawLevel)) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }

  const limitParam = parseInt(searchParams.get('limit') ?? '200', 10);
  const limit = Number.isNaN(limitParam) ? 200 : Math.min(Math.max(1, limitParam), 500);

  const logs = await prisma.botLog.findMany({
    where: {
      ...(rawMarket ? { market: rawMarket } : {}),
      ...(rawLevel ? { level: rawLevel } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ logs });
}
