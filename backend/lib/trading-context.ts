import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

interface TradeRecord {
  time: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  total: number;
  orderId: string;
}

interface DailyContext {
  date: string;
  trades: TradeRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const CONTEXT_FILE = path.join(DATA_DIR, 'trading-context.json');

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
}

async function load(): Promise<DailyContext> {
  const today = new Date().toISOString().split('T')[0];
  try {
    const raw = await readFile(CONTEXT_FILE, 'utf-8');
    const ctx = JSON.parse(raw) as DailyContext;
    // Auto-reset when a new day starts
    if (ctx.date !== today) return { date: today, trades: [] };
    return ctx;
  } catch {
    return { date: today, trades: [] };
  }
}

async function save(ctx: DailyContext): Promise<void> {
  await ensureDataDir();
  await writeFile(CONTEXT_FILE, JSON.stringify(ctx, null, 2), 'utf-8');
}

export async function recordTrade(params: {
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  orderId: string;
}): Promise<void> {
  const ctx = await load();
  const time = new Date().toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City',
  });
  ctx.trades.push({
    time,
    symbol: params.symbol,
    action: params.action,
    quantity: params.quantity,
    price: params.price,
    total: params.price * params.quantity,
    orderId: params.orderId,
  });
  await save(ctx);
}

export async function resetDailyContext(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await save({ date: today, trades: [] });
}

export async function buildContextSection(
  positions: Array<{ ticker: string; position: number; avgCost: number }>
): Promise<string> {
  const ctx = await load();
  const lines: string[] = [];

  if (ctx.trades.length > 0) {
    lines.push("TODAY'S EXECUTED TRADES:");
    for (const t of ctx.trades) {
      lines.push(
        `• ${t.time}  ${t.action} ${t.symbol} ×${t.quantity} @ ${t.price.toFixed(2)} MXN = ${t.total.toFixed(2)} MXN (order #${t.orderId})`
      );
    }
  } else {
    lines.push("TODAY'S EXECUTED TRADES: none");
  }

  lines.push('');

  const open = positions.filter(p => p.position > 0);
  if (open.length > 0) {
    lines.push('CURRENT OPEN POSITIONS:');
    for (const p of open) {
      lines.push(`• ${p.ticker}: ${p.position} shares @ avg ${p.avgCost.toFixed(2)} MXN`);
    }
  } else {
    lines.push('CURRENT OPEN POSITIONS: none');
  }

  return lines.join('\n');
}
