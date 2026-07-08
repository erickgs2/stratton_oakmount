import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Market } from '@/lib/market';

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    market: Market;
    symbols: string[];
    capitalLimit: number;
    intervalMin: number;
    confidenceThreshold: number;
    takeProfitPct: number;
    stopLossPct: number;
    feeEstimatePct: number;
  };
  const {
    market, symbols, capitalLimit, intervalMin, confidenceThreshold,
    takeProfitPct, stopLossPct, feeEstimatePct,
  } = body;

  const config = await prisma.botConfig.upsert({
    where: { market },
    create: {
      market, symbols, capitalLimit, intervalMin, confidenceThreshold,
      takeProfitPct, stopLossPct, feeEstimatePct, isActive: false,
    },
    update: {
      symbols, capitalLimit, intervalMin, confidenceThreshold,
      takeProfitPct, stopLossPct, feeEstimatePct,
    },
  });

  return NextResponse.json({ status: 'saved', config });
}
