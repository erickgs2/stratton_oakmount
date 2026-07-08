import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runAgentCycle } from '@/lib/claude-agent';
import { Market } from '@/lib/market';

export async function POST(request: NextRequest) {
  const body = await request.json() as { symbol: string; market: Market };
  const { symbol, market } = body;

  if (!symbol || !market) {
    return NextResponse.json({ error: 'symbol and market are required' }, { status: 400 });
  }

  try {
    const config = await prisma.botConfig.findUnique({ where: { market } });
    const result = await runAgentCycle(symbol, market, {
      capitalLimit: config?.capitalLimit ?? undefined,
      confidenceThreshold: config?.confidenceThreshold ?? 0.65,
      intervalMin: config?.intervalMin ?? 15,
      takeProfitPct: config?.takeProfitPct ?? 1.5,
      stopLossPct: config?.stopLossPct ?? 1.0,
      feeEstimatePct: config?.feeEstimatePct ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
