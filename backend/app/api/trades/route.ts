import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market') as 'MX' | 'USA' | null;
  const symbol = searchParams.get('symbol');
  const from = searchParams.get('from');

  const trades = await prisma.trade.findMany({
    where: {
      ...(market ? { market } : {}),
      ...(symbol ? { symbol } : {}),
      ...(from ? { createdAt: { gte: new Date(from) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json(trades);
}
