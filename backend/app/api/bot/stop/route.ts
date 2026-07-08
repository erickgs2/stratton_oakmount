import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ibkrClient } from '@/lib/ibkr';
import { writeBotLog } from '@/lib/bot-logger';
import { resetDailyContext } from '@/lib/trading-context';
import { Market } from '@/lib/market';

export async function POST(request: NextRequest) {
  const body = await request.json() as { market: Market };
  const { market } = body;

  await prisma.botConfig.upsert({
    where: { market },
    create: { market, symbols: [], capitalLimit: 0, intervalMin: 1, isActive: false },
    update: { isActive: false },
  });

  const intervalKey = `bot-${market}`;
  if (global.botIntervals?.has(intervalKey)) {
    clearInterval(global.botIntervals.get(intervalKey));
    global.botIntervals.delete(intervalKey);
  }

  if (market !== 'CRYPTO') {
    ibkrClient.stopKeepAlive();
    await resetDailyContext();
  }

  await writeBotLog({
    level: 'info',
    event: 'bot_stopped',
    market,
    message: `Bot stopped for ${market}`,
  });

  return NextResponse.json({ status: 'stopped', market });
}
