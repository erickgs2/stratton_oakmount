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
    // Leave confidenceThreshold/takeProfitPct/stopLossPct as undefined rather
    // than hardcoding stock-style numbers here when no BotConfig row exists
    // yet — runAgentCycle/runCryptoAgentCycle each apply their own
    // market-appropriate defaults (crypto's are wider than stocks').
    const result = await runAgentCycle(symbol, market, {
      capitalLimit: config?.capitalLimit ?? undefined,
      confidenceThreshold: config?.confidenceThreshold ?? undefined,
      intervalMin: config?.intervalMin ?? 15,
      takeProfitPct: config?.takeProfitPct ?? undefined,
      stopLossPct: config?.stopLossPct ?? undefined,
      feeEstimatePct: config?.feeEstimatePct ?? undefined,
      tpSlBypassEnabled: config?.tpSlBypassEnabled ?? false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
