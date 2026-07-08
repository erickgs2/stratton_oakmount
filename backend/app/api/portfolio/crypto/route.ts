import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCryptoPortfolio } from '@/lib/bitso-portfolio';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const config = await prisma.botConfig.findUnique({ where: { market: 'CRYPTO' } });
  const symbols = config?.symbols ?? [];

  if (symbols.length === 0) {
    return NextResponse.json({ currency: 'MXN', availableFunds: 0, netLiquidation: 0, positions: [] });
  }

  try {
    const portfolio = await getCryptoPortfolio(symbols);
    return NextResponse.json(portfolio);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
