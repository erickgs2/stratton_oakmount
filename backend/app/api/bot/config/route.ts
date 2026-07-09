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
    tpSlBypassEnabled: boolean;
  };
  const {
    market, symbols, capitalLimit, intervalMin, confidenceThreshold,
    takeProfitPct, stopLossPct, feeEstimatePct, tpSlBypassEnabled,
  } = body;

  const config = await prisma.botConfig.upsert({
    where: { market },
    create: {
      market, symbols, capitalLimit, intervalMin, confidenceThreshold,
      takeProfitPct, stopLossPct, feeEstimatePct, tpSlBypassEnabled: tpSlBypassEnabled ?? false, isActive: false,
    },
    update: {
      symbols, capitalLimit, intervalMin, confidenceThreshold,
      takeProfitPct, stopLossPct, feeEstimatePct, tpSlBypassEnabled: tpSlBypassEnabled ?? false,
    },
  });

  return NextResponse.json({ status: 'saved', config });
}
