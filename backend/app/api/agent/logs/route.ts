import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market') as 'MX' | 'USA' | null;
  const limitParam = parseInt(searchParams.get('limit') ?? '50', 10);
  const limit = Number.isNaN(limitParam) ? 50 : limitParam;

  const logs = await prisma.agentLog.findMany({
    where: market ? { market } : {},
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ logs });
}
