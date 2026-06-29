import { prisma } from '@/lib/prisma';

interface BotLogEntry {
  level: 'info' | 'warn' | 'error';
  event: 'bot_started' | 'bot_stopped' | 'cycle_error' | 'cycle_complete' | 'order_placed';
  market?: string;
  symbol?: string;
  message: string;
  meta?: Record<string, unknown>;
}

export async function writeBotLog(entry: BotLogEntry): Promise<void> {
  try {
    await prisma.botLog.create({ data: entry });
  } catch (err) {
    console.error('[BotLogger] Failed to write log:', (err as Error).message);
  }
}
