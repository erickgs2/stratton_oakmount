import { prisma } from '@/lib/prisma';
import { Market } from '@/lib/market';

const MARKET_TIMEZONE: Record<Market, string> = {
  MX: 'America/Mexico_City',
  USA: 'America/New_York',
  // Crypto trades 24/7 with no natural "trading day" boundary — bucket by
  // the same timezone used for the user's other reports, for consistency.
  CRYPTO: 'America/Mexico_City',
};

// Local calendar date (YYYY-MM-DD) in the given market's timezone — same
// timezone convention used for market-hours checks and trading-context.ts.
function dateKey(date: Date, market: Market): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MARKET_TIMEZONE[market],
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

interface TradeRow {
  symbol: string;
  action: string;
  quantity: number;
  price: number;
  createdAt: Date;
}

interface RealizedPnlEvent {
  symbol: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  realizedPnl: number;
  sellDate: string;
}

// FIFO-matches each sell against the earliest still-open buy lots for the same
// symbol, in chronological order. This is GROSS realized P&L — actual
// commissions/slippage are not recorded per trade anywhere in this app
// (BotConfig.feeEstimatePct is a prompt-time estimate fed to Claude, not a
// recorded actual cost), so real net P&L will run slightly lower than this.
// A sell that exceeds all recorded buy history (e.g. a position opened before
// trade logging started) simply stops producing events once open lots run out
// — the unmatched portion contributes no realized P&L rather than erroring.
function computeRealizedPnlEvents(trades: TradeRow[], market: Market): RealizedPnlEvent[] {
  const bySymbol = new Map<string, TradeRow[]>();
  for (const t of trades) {
    if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
    bySymbol.get(t.symbol)!.push(t);
  }

  const events: RealizedPnlEvent[] = [];

  for (const symbolTrades of Array.from(bySymbol.values())) {
    const sorted = [...symbolTrades].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const openLots: { quantity: number; price: number }[] = [];

    for (const t of sorted) {
      if (t.action === 'buy') {
        openLots.push({ quantity: t.quantity, price: t.price });
        continue;
      }
      if (t.action !== 'sell') continue;

      let remaining = t.quantity;
      while (remaining > 0 && openLots.length > 0) {
        const lot = openLots[0];
        const matched = Math.min(lot.quantity, remaining);
        events.push({
          symbol: t.symbol,
          quantity: matched,
          buyPrice: lot.price,
          sellPrice: t.price,
          realizedPnl: (t.price - lot.price) * matched,
          sellDate: dateKey(t.createdAt, market),
        });
        lot.quantity -= matched;
        remaining -= matched;
        if (lot.quantity <= 0) openLots.shift();
      }
    }
  }

  return events;
}

export interface DailyPnlSummary {
  date: string;
  realizedPnl: number;
  buys: number;
  sells: number;
  holds: number;
  outcome: 'win' | 'loss' | 'flat';
}

export interface PnlReport {
  market: Market;
  currency: string;
  currentSessionRealizedPnl: number;
  allTimeRealizedPnl: number;
  days: DailyPnlSummary[];
}

export async function getPnlReport(market: Market): Promise<PnlReport> {
  const currency = market === 'MX' ? 'MXN' : market === 'USA' ? 'USD' : 'MXN';

  const [trades, agentLogs] = await Promise.all([
    prisma.trade.findMany({ where: { market }, orderBy: { createdAt: 'asc' } }),
    prisma.agentLog.findMany({ where: { market }, orderBy: { createdAt: 'asc' } }),
  ]);

  const events = computeRealizedPnlEvents(trades, market);

  const byDate = new Map<string, DailyPnlSummary>();
  const ensureDay = (date: string): DailyPnlSummary => {
    let day = byDate.get(date);
    if (!day) {
      day = { date, realizedPnl: 0, buys: 0, sells: 0, holds: 0, outcome: 'flat' };
      byDate.set(date, day);
    }
    return day;
  };

  for (const ev of events) {
    ensureDay(ev.sellDate).realizedPnl += ev.realizedPnl;
  }

  // Buys/sells are counted from actually-executed trades (real money impact,
  // and what the realized P&L above is computed from). Holds have no
  // corresponding Trade row at all — AgentLog is the only place a "hold"
  // decision is recorded, so it's the only source for that count.
  for (const t of trades) {
    const day = ensureDay(dateKey(t.createdAt, market));
    if (t.action === 'buy') day.buys += 1;
    else if (t.action === 'sell') day.sells += 1;
  }

  for (const log of agentLogs) {
    const action = (log.response as { action?: string } | null)?.action;
    if (action === 'hold') {
      ensureDay(dateKey(log.createdAt, market)).holds += 1;
    }
  }

  for (const day of Array.from(byDate.values())) {
    day.realizedPnl = Math.round(day.realizedPnl * 100) / 100;
    day.outcome = day.realizedPnl > 0 ? 'win' : day.realizedPnl < 0 ? 'loss' : 'flat';
  }

  const days = Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));

  const today = dateKey(new Date(), market);
  const currentSessionRealizedPnl = byDate.get(today)?.realizedPnl ?? 0;
  const allTimeRealizedPnl = Math.round(
    days.reduce((sum, d) => sum + d.realizedPnl, 0) * 100
  ) / 100;

  return { market, currency, currentSessionRealizedPnl, allTimeRealizedPnl, days };
}
