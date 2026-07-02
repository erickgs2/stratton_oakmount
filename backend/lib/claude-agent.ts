import Anthropic from '@anthropic-ai/sdk';
import { getMXMarketData } from '@/lib/databursatil';
import { getUSAMarketData } from '@/lib/ibkr-market-data';
import { ibkrClient } from '@/lib/ibkr';
import { calculateIndicators } from '@/lib/indicators';
import { isMarketOpen } from '@/lib/market-hours';
import { prisma } from '@/lib/prisma';
import { writeBotLog } from '@/lib/bot-logger';
import { buildContextSection, recordTrade } from '@/lib/trading-context';

export interface AgentCycleResult {
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  confidence: number;
  reason: string;
  executed: boolean;
}

interface ClaudeDecision {
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  confidence: number;
  reason: string;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPTS: Record<'MX' | 'USA', string> = {
  MX: `You are an expert trader on the Mexican Stock Exchange (BMV).
You know the Mexican market, its leading issuers (America Movil, FEMSA, Walmart de Mexico, Grupo Bimbo, Grupo Carso)
and the macroeconomic factors that affect it (USD/MXN exchange rate, Banxico rates, IPC index).
Your goal is to generate consistent returns in Mexican pesos with conservative risk management.
You MUST respond ONLY with valid JSON in this exact format:
{"action":"buy"|"sell"|"hold","quantity":0,"confidence":0.0,"reason":"..."}`,

  USA: `You are an expert trader on NYSE and Nasdaq.
Your goal is to generate consistent returns in US dollars with conservative risk management.
You MUST respond ONLY with valid JSON in this exact format:
{"action":"buy"|"sell"|"hold","quantity":0,"confidence":0.0,"reason":"..."}`,
};

function sign(n: number): string { return n >= 0 ? '+' : ''; }

function buildUserPrompt(
  symbol: string,
  market: 'MX' | 'USA',
  lastPrice: number,
  changePct: number,
  volume: number,
  indicators: ReturnType<typeof calculateIndicators>,
  closePrices: number[],
  currentPosition: number,
  currentPositionAvgCost: number,
  availableFunds: number,
  capitalLimit: number | undefined,
  effectiveCapital: number,
  netLiquidation: number,
  totalUnrealizedPnl: number,
  intervalMin: number,
  tradingContext: string,
): string {
  const currency = market === 'MX' ? 'MXN' : 'USD';
  const maxInvestment = effectiveCapital * 0.20;
  const maxQuantity = lastPrice > 0 ? Math.floor(maxInvestment / lastPrice) : 0;

  // Price range from historical data
  const last20       = closePrices.slice(-20);
  const high20       = Math.max(...last20);
  const low20        = Math.min(...last20);
  const periodHigh   = Math.max(...closePrices);
  const periodLow    = Math.min(...closePrices);
  const periodDays   = closePrices.length;
  const distHigh20   = ((lastPrice - high20)   / high20)   * 100;
  const distLow20    = ((lastPrice - low20)    / low20)    * 100;
  const distMA20     = ((lastPrice - indicators.ma20) / indicators.ma20) * 100;
  const distMA50     = ((lastPrice - indicators.ma50) / indicators.ma50) * 100;

  // Portfolio composition
  const invested       = netLiquidation - availableFunds;
  const cashPct        = netLiquidation > 0 ? (availableFunds / netLiquidation) * 100 : 0;
  const investedPct    = 100 - cashPct;
  const portPnlPct     = netLiquidation > 0
    ? (totalUnrealizedPnl / (netLiquidation - totalUnrealizedPnl)) * 100
    : 0;
  const cashWarning    = cashPct < 10 ? ' ⚠ very low — be conservative about new buys'
    : cashPct < 20 ? ' (limited liquidity)'
    : '';

  // Current position context for the symbol being analyzed
  const positionLine = currentPosition > 0
    ? `${currentPosition} shares already held (avg cost ${currentPositionAvgCost.toFixed(2)} ${currency})`
    : 'no current position';

  return `You are being asked to analyze ${symbol} and return a trading decision as JSON.

━━━ CHECK FREQUENCY ━━━
This analysis cycle runs every ${intervalMin} minute${intervalMin === 1 ? '' : 's'} during market hours.
Implication: you will see this symbol again soon. Avoid acting on a marginal signal — wait for the next cycle
if conditions are unclear. Also avoid repeating a buy/sell that already fired earlier today (see TRADING CONTEXT).

━━━ MARKET DATA ━━━
Symbol    : ${symbol}
Last Price: ${lastPrice.toFixed(2)} ${currency}  — the most recent trade price
Day Change: ${sign(changePct)}${changePct.toFixed(2)}%         — price change vs yesterday's close
Volume    : ${volume.toLocaleString()} shares   — total shares traded so far today

━━━ TECHNICAL INDICATORS ━━━
RSI (14)       : ${indicators.rsi14.toFixed(2)}
  Interpretation: >70 = overbought (likely to pull back), <30 = oversold (potential bounce), 30–70 = neutral

MA20 (20-day moving avg): ${indicators.ma20.toFixed(2)} ${currency}  → price is ${sign(distMA20)}${distMA20.toFixed(1)}% ${distMA20 >= 0 ? 'above' : 'below'} MA20
MA50 (50-day moving avg): ${indicators.ma50.toFixed(2)} ${currency}  → price is ${sign(distMA50)}${distMA50.toFixed(1)}% ${distMA50 >= 0 ? 'above' : 'below'} MA50
  Interpretation: price above both MAs = bullish trend; below both = bearish; between them = mixed signal

5-Day Change   : ${sign(indicators.percentChange5d)}${indicators.percentChange5d.toFixed(2)}%  — short-term momentum over last 5 sessions

Volume Ratio   : ${indicators.volumeRatio.toFixed(2)}x vs 20-day average
  Interpretation: >1.5x = unusually high participation (confirms moves), <0.5x = low conviction (be cautious)

20-Day High    : ${high20.toFixed(2)} ${currency}  (current price is ${sign(distHigh20)}${distHigh20.toFixed(1)}% from this level)
20-Day Low     : ${low20.toFixed(2)} ${currency}   (current price is ${sign(distLow20)}${distLow20.toFixed(1)}% from this level)
  Interpretation: price near 20d high = potential resistance; near 20d low = potential support

${periodDays}-Day High : ${periodHigh.toFixed(2)} ${currency}
${periodDays}-Day Low  : ${periodLow.toFixed(2)} ${currency}
  Interpretation: these are the broader range boundaries over the full data window

━━━ CAPITAL FOR THIS CYCLE ━━━
Capital limit per cycle : ${capitalLimit != null ? `${capitalLimit.toFixed(2)} ${currency}` : 'not set (no cap)'}
  — This is the absolute maximum the user allows to deploy in a single bot cycle. Do not exceed it.
Available funds         : ${availableFunds.toFixed(2)} ${currency}  — liquid cash currently in the account
Effective capital       : ${effectiveCapital.toFixed(2)} ${currency}  — min(capital limit, available funds); your actual budget
Max per position (20%)  : ${maxInvestment.toFixed(2)} ${currency}  — hard cap per symbol = 20% of effective capital
Max quantity you can buy: ${maxQuantity} shares  — floor(max per position / last price)

━━━ PORTFOLIO SUMMARY ━━━
Net Liquidation (total portfolio value): ${netLiquidation.toFixed(2)} ${currency}
  — sum of all positions at market value plus cash; the full size of the account

Cash / Available funds  : ${availableFunds.toFixed(2)} ${currency}  (${cashPct.toFixed(1)}% of portfolio)${cashWarning}
Invested in positions   : ${invested.toFixed(2)} ${currency}  (${investedPct.toFixed(1)}% of portfolio)
  — how much capital is already deployed; high invested % means limited room for new positions

Total Unrealized P&L    : ${sign(totalUnrealizedPnl)}${totalUnrealizedPnl.toFixed(2)} ${currency}  (${sign(portPnlPct)}${portPnlPct.toFixed(1)}% on cost)
  — overall profit/loss on all current open positions; positive = portfolio is up, negative = portfolio is down

Current position in ${symbol}: ${positionLine}
  — your existing exposure to this specific symbol before any new trade

━━━ TRADING CONTEXT ━━━
${tradingContext}

━━━ DECISION RULES ━━━
1. quantity must be 0 when action is "hold"
2. Never exceed max quantity (${maxQuantity} shares) for a buy
3. Never sell more shares than currently held in ${symbol}
4. Effective capital limit (${effectiveCapital.toFixed(2)} ${currency}) is a hard ceiling — do not exceed it
5. If the portfolio is already heavily invested (>80%), prefer hold over adding new positions unless signal is very strong
6. Avoid repeating a trade you already executed today — check TODAY'S EXECUTED TRADES above
7. Set confidence < ${0.65} if conditions are ambiguous; the bot will skip execution below the threshold

Respond with JSON only: {"action":"buy"|"sell"|"hold","quantity":0,"confidence":0.0,"reason":"..."}`;
}

interface ClaudeRequestBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: 'user'; content: string }[];
}

interface AgentRequestContext {
  request: ClaudeRequestBody;
  lastPrice: number;
  changePct: number;
  volume: number;
  indicators: ReturnType<typeof calculateIndicators>;
  currentPosition: number;
  currentAvgCost: number;
  availableFunds: number;
  effectiveCapital: number;
  netLiquidation: number;
  totalUnrealizedPnl: number;
  positions: Awaited<ReturnType<typeof ibkrClient.getPositions>>;
}

// Shared by runAgentCycle (which sends this to Claude and acts on the
// response) and previewAgentRequest (which returns it as-is, read-only,
// for the "Requests example" panel — neither calls Claude nor touches the
// database/broker beyond the same read-only calls runAgentCycle makes).
async function buildAgentRequestContext(
  symbol: string,
  market: 'MX' | 'USA',
  capitalLimit: number | undefined,
  intervalMin: number,
): Promise<AgentRequestContext> {
  let lastPrice: number;
  let changePct: number;
  let volume: number;
  let closePrices: number[];
  let volumes: number[];

  if (market === 'MX') {
    const data = await getMXMarketData(symbol);
    lastPrice   = data.lastPrice;
    changePct   = data.changePct;
    volume      = data.volume;
    closePrices = data.history.map(h => h.close);
    volumes     = data.history.map(h => h.volume);
  } else {
    const data = await getUSAMarketData(symbol);
    lastPrice   = data.lastPrice;
    changePct   = data.changePct;
    volume      = data.volume;
    closePrices = data.history.map(h => h.close);
    volumes     = data.history.map(h => h.volume);
  }

  const indicators = calculateIndicators(closePrices, volumes);

  const [positions, summary] = await Promise.all([
    ibkrClient.getPositions(),
    ibkrClient.getAccountSummary(),
  ]);

  const currentPos         = positions.find(p => p.ticker === symbol);
  const currentPosition    = currentPos?.position ?? 0;
  const currentAvgCost     = currentPos?.avgCost ?? 0;
  const availableFunds     = summary.availableFunds;
  const effectiveCapital   = capitalLimit ? Math.min(availableFunds, capitalLimit) : availableFunds;
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

  const tradingContext = await buildContextSection(positions, summary.netLiquidation);

  const request: ClaudeRequestBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: SYSTEM_PROMPTS[market],
    messages: [
      {
        role: 'user',
        content: buildUserPrompt(
          symbol, market, lastPrice, changePct, volume,
          indicators, closePrices,
          currentPosition, currentAvgCost,
          availableFunds, capitalLimit, effectiveCapital,
          summary.netLiquidation, totalUnrealizedPnl,
          intervalMin, tradingContext,
        ),
      },
    ],
  };

  return {
    request, lastPrice, changePct, volume, indicators,
    currentPosition, currentAvgCost, availableFunds, effectiveCapital,
    netLiquidation: summary.netLiquidation, totalUnrealizedPnl, positions,
  };
}

export interface AgentRequestPreview {
  symbol: string;
  market: 'MX' | 'USA';
  readable: {
    lastPrice: number;
    changePct: number;
    volume: number;
    currency: string;
    rsi14: number;
    ma20: number;
    ma50: number;
    percentChange5d: number;
    volumeRatio: number;
    capitalLimit: number | null;
    intervalMin: number;
    availableFunds: number;
    effectiveCapital: number;
    netLiquidation: number;
    totalUnrealizedPnl: number;
    currentPosition: number;
    currentAvgCost: number;
  };
  request: ClaudeRequestBody;
}

// Read-only: builds the exact request runAgentCycle would send to Claude
// right now for one of this market's configured symbols, without ever
// calling Claude, placing an order, or writing a log/trade record.
export async function previewAgentRequest(market: 'MX' | 'USA'): Promise<AgentRequestPreview> {
  const config = await prisma.botConfig.findUnique({ where: { market } });
  const symbol = config?.symbols?.[0];
  if (!symbol) {
    throw new Error(`No symbols configured for ${market} — add at least one symbol in Bot Config first`);
  }

  const capitalLimit = config?.capitalLimit ?? undefined;
  const intervalMin  = config?.intervalMin ?? 15;
  const ctx = await buildAgentRequestContext(symbol, market, capitalLimit, intervalMin);

  return {
    symbol,
    market,
    readable: {
      lastPrice: ctx.lastPrice,
      changePct: ctx.changePct,
      volume: ctx.volume,
      currency: market === 'MX' ? 'MXN' : 'USD',
      rsi14: ctx.indicators.rsi14,
      ma20: ctx.indicators.ma20,
      ma50: ctx.indicators.ma50,
      percentChange5d: ctx.indicators.percentChange5d,
      volumeRatio: ctx.indicators.volumeRatio,
      capitalLimit: capitalLimit ?? null,
      intervalMin,
      availableFunds: ctx.availableFunds,
      effectiveCapital: ctx.effectiveCapital,
      netLiquidation: ctx.netLiquidation,
      totalUnrealizedPnl: ctx.totalUnrealizedPnl,
      currentPosition: ctx.currentPosition,
      currentAvgCost: ctx.currentAvgCost,
    },
    request: ctx.request,
  };
}

export async function runAgentCycle(
  symbol: string,
  market: 'MX' | 'USA',
  capitalLimit?: number,
  confidenceThreshold = 0.65,
  intervalMin = 15,
): Promise<AgentCycleResult> {
  if (!isMarketOpen(market)) {
    return { action: 'hold', quantity: 0, confidence: 0, reason: 'Market is closed', executed: false };
  }

  const ctx = await buildAgentRequestContext(symbol, market, capitalLimit, intervalMin);
  const {
    lastPrice, changePct, volume, indicators,
    currentPosition, currentAvgCost, availableFunds, effectiveCapital,
    netLiquidation, positions,
  } = ctx;

  const message = await anthropic.messages.create(ctx.request);

  const rawText  = message.content[0].type === 'text' ? message.content[0].text : '';
  const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let decision: ClaudeDecision;
  try {
    decision = JSON.parse(cleanText) as ClaudeDecision;
  } catch {
    decision = { action: 'hold', quantity: 0, confidence: 0, reason: `Parse error: ${rawText}` };
  }

  // Enforce quantity caps server-side after Claude responds
  const maxInvestment = effectiveCapital * 0.20;
  const maxQuantity   = lastPrice > 0 ? Math.floor(maxInvestment / lastPrice) : 0;

  if (decision.action === 'buy'  && decision.quantity > maxQuantity)     decision.quantity = maxQuantity;
  if (decision.action === 'sell' && decision.quantity > currentPosition) decision.quantity = currentPosition;

  const marketData = { lastPrice, changePct, volume, indicators };
  let executed    = false;
  let ibkrOrderId: string | undefined;

  if (
    (decision.action === 'buy' || decision.action === 'sell') &&
    decision.confidence < confidenceThreshold &&
    decision.quantity > 0
  ) {
    await writeBotLog({
      level: 'warn',
      event: 'order_skipped',
      market,
      symbol,
      message: `${symbol} ${decision.action.toUpperCase()} x${decision.quantity} skipped — confidence ${decision.confidence.toFixed(2)} below ${confidenceThreshold.toFixed(2)} threshold`,
      meta: { action: decision.action, quantity: decision.quantity, confidence: decision.confidence, threshold: confidenceThreshold },
    });
  }

  if (
    (decision.action === 'buy' || decision.action === 'sell') &&
    decision.confidence >= confidenceThreshold &&
    decision.quantity > 0
  ) {
    const exchange = market === 'MX' ? 'BMV' : 'SMART';

    let conid: number | undefined = positions.find(p => p.ticker === symbol)?.conid;
    if (!conid && decision.action === 'buy') {
      const found = await ibkrClient.searchConid(symbol, exchange);
      conid = found ?? undefined;
    }

    if (conid) {
      ibkrOrderId = await ibkrClient.placeOrder({
        conid,
        side: decision.action === 'buy' ? 'BUY' : 'SELL',
        quantity: decision.quantity,
        market,
      });

      if (ibkrOrderId) {
        executed = true;
        await recordTrade({
          symbol,
          action: decision.action === 'buy' ? 'BUY' : 'SELL',
          quantity: decision.quantity,
          price: lastPrice,
          orderId: ibkrOrderId,
        });
        await writeBotLog({
          level: 'info',
          event: 'order_placed',
          market,
          symbol,
          message: `${symbol} ${decision.action.toUpperCase()} x${decision.quantity} @ ${lastPrice.toFixed(2)} ${market === 'MX' ? 'MXN' : 'USD'} — order #${ibkrOrderId}`,
        });
      } else {
        await writeBotLog({
          level: 'warn',
          event: 'order_skipped',
          market,
          symbol,
          message: `${symbol} ${decision.action.toUpperCase()} x${decision.quantity} — IBKR rejected (no order ID). conid ${conid} may not be tradeable on ${market === 'MX' ? 'BMV' : 'SMART'}.`,
          meta: { conid, action: decision.action, quantity: decision.quantity },
        });
      }
    } else {
      await writeBotLog({
        level: 'warn',
        event: 'order_skipped',
        market,
        symbol,
        message: `${symbol} ${decision.action.toUpperCase()} signal skipped — contract not found on IBKR (conid lookup failed)`,
      });
    }
  }

  await prisma.agentLog.create({
    data: {
      symbol,
      market,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      marketData: JSON.parse(JSON.stringify(marketData)),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: JSON.parse(JSON.stringify(decision)),
      executed,
    },
  });

  let cycleNote = '';
  if (decision.action !== 'hold') {
    if (executed)                                    cycleNote = ` — executed (order #${ibkrOrderId ?? ''})`;
    else if (decision.confidence < confidenceThreshold) cycleNote = ` — skipped: confidence ${decision.confidence.toFixed(2)} below ${confidenceThreshold.toFixed(2)} threshold`;
    else if (decision.quantity === 0)                cycleNote = ` — skipped: quantity 0`;
  }

  await writeBotLog({
    level: 'info',
    event: 'cycle_complete',
    market,
    symbol,
    message: `${symbol} → ${decision.action.toUpperCase()} x${decision.quantity} (confidence ${decision.confidence.toFixed(2)})${cycleNote}`,
    meta: { action: decision.action, quantity: decision.quantity, confidence: decision.confidence, executed },
  });

  if (executed) {
    await prisma.trade.create({
      data: {
        symbol,
        market,
        action: decision.action,
        quantity: decision.quantity,
        price: lastPrice,
        currency: market === 'MX' ? 'MXN' : 'USD',
        reason: decision.reason,
        ibkrOrderId,
      },
    });
  }

  return { ...decision, executed };
}
