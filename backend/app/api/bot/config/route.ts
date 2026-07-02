import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    market: 'MX' | 'USA';
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
