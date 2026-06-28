import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runAgentCycle } from '@/lib/claude-agent';
import { ibkrClient } from '@/lib/ibkr';

// Module-level interval map — persists across requests in the same server process
declare global {
  // eslint-disable-next-line no-var
  var botIntervals: Map<string, NodeJS.Timeout>;
}
global.botIntervals = global.botIntervals ?? new Map();

export async function POST(request: NextRequest) {
  const body = await request.json() as { market: 'MX' | 'USA'; symbols: string[]; capitalLimit: number; intervalMin: number };
  const { market, symbols, capitalLimit, intervalMin } = body;

  const config = await prisma.botConfig.upsert({
    where: { market },
    create: { market, symbols, capitalLimit, intervalMin, isActive: true },
    update: { symbols, capitalLimit, intervalMin, isActive: true },
  });

  ibkrClient.startKeepAlive();

  const intervalKey = `bot-${market}`;
  if (global.botIntervals.has(intervalKey)) {
    clearInterval(global.botIntervals.get(intervalKey));
  }

  const interval = setInterval(async () => {
    for (const symbol of symbols) {
      try {
        await runAgentCycle(symbol, market);
      } catch (err) {
        console.error(`[Bot] Agent cycle error for ${symbol}:`, (err as Error).message);
      }
    }
  }, intervalMin * 60_000);

  global.botIntervals.set(intervalKey, interval);

  return NextResponse.json({ status: 'started', config });
}
