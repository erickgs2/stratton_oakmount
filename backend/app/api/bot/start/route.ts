import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runAgentCycle } from '@/lib/claude-agent';
import { ibkrClient } from '@/lib/ibkr';
import { writeBotLog } from '@/lib/bot-logger';
import { isMarketOpen } from '@/lib/market-hours';
import { Market } from '@/lib/market';

// Module-level interval map — persists across requests in the same server process
declare global {
  // eslint-disable-next-line no-var
  var botIntervals: Map<string, NodeJS.Timeout>;
}
global.botIntervals = global.botIntervals ?? new Map();

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
      takeProfitPct, stopLossPct, feeEstimatePct, isActive: true,
    },
    update: {
      symbols, capitalLimit, intervalMin, confidenceThreshold,
      takeProfitPct, stopLossPct, feeEstimatePct, isActive: true,
    },
  });

  await writeBotLog({
    level: 'info',
    event: 'bot_started',
    market,
    message: `Bot started for ${market} — ${symbols.slice(0, 2).join(', ')}${symbols.length > 2 ? ` (+${symbols.length - 2} more)` : ''}`,
  });

  if (market !== 'CRYPTO') ibkrClient.startKeepAlive();

  const intervalKey = `bot-${market}`;
  if (global.botIntervals.has(intervalKey)) {
    clearInterval(global.botIntervals.get(intervalKey));
  }

  const interval = setInterval(async () => {
    if (!isMarketOpen(market)) return; // no API calls while market is closed
    for (const symbol of symbols) {
      try {
        await runAgentCycle(symbol, market, {
          capitalLimit, confidenceThreshold, intervalMin,
          takeProfitPct, stopLossPct, feeEstimatePct,
        });
      } catch (err) {
        console.error(`[Bot] Agent cycle error for ${symbol}:`, (err as Error).message);
        await writeBotLog({
          level: 'error',
          event: 'cycle_error',
          market,
          symbol,
          message: (err as Error).message,
        });
      }
    }
  }, intervalMin * 60_000);

  global.botIntervals.set(intervalKey, interval);

  return NextResponse.json({ status: 'started', config });
}
