import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isBMVOpen, isNYSEOpen, isCryptoOpen } from '@/lib/market-hours';
import { Market } from '@/lib/market';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market') as Market | null;

  const configs = await prisma.botConfig.findMany({
    where: market ? { market } : {},
  });

  return NextResponse.json({
    configs,
    markets: { MX: isBMVOpen(), USA: isNYSEOpen(), CRYPTO: isCryptoOpen() },
  });
}
