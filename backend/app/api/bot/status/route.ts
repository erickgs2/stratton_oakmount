import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market') as 'MX' | 'USA' | null;

  const configs = await prisma.botConfig.findMany({
    where: market ? { market } : {},
  });

  return NextResponse.json(configs);
}
