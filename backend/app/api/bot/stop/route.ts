import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const body = await request.json() as { market: 'MX' | 'USA' };
  const { market } = body;

  await prisma.botConfig.update({
    where: { market },
    data: { isActive: false },
  });

  const intervalKey = `bot-${market}`;
  if (global.botIntervals?.has(intervalKey)) {
    clearInterval(global.botIntervals.get(intervalKey));
    global.botIntervals.delete(intervalKey);
  }

  return NextResponse.json({ status: 'stopped', market });
}
