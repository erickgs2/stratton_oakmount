import Anthropic from '@anthropic-ai/sdk';
import { getMXMarketData } from '@/lib/databursatil';
import { getUSAMarketData } from '@/lib/ibkr-market-data';
import { ibkrClient } from '@/lib/ibkr';
import { calculateIndicators } from '@/lib/indicators';
import { isMarketOpen } from '@/lib/market-hours';
import { prisma } from '@/lib/prisma';
import { writeBotLog } from '@/lib/bot-logger';
import { buildContextSection, recordTrade, peekLastPrice, recordLastPrice } from '@/lib/trading-context';

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

Your PRIMARY strategy is scalping: take many small, frequent gains of roughly 0.5%-2% per trade rather than
holding for large moves. Lock in profits early and cut losses quickly — a fast, reliable small win beats a slow,
uncertain large one. You are expected to complete full buy-then-sell round trips on the same symbol multiple
times in a single day when the signal supports it.

EXCEPTION: you may hold a position longer than the usual scalping target only when several indicators align to
show strong, sustained momentum (e.g. RSI trending with the move and not yet overbought/oversold against it,
price above both MA20 and MA50 with widening distance, volume ratio confirming participation). If you decide to
deviate from the default scalping behavior and hold for a larger move, you MUST say so explicitly in "reason"
(e.g. "Holding beyond scalping target — MA20/MA50/RSI/volume all confirm a strong uptrend").

Your goal is to generate consistent returns in Mexican pesos while managing risk tightly on every trade.
You MUST respond ONLY with valid JSON in this exact format:
{"action":"buy"|"sell"|"hold","quantity":0,"confidence":0.0,"reason":"..."}`,

  USA: `You are an expert trader on NYSE and Nasdaq.

Your PRIMARY strategy is scalping: take many small, frequent gains of roughly 0.5%-2% per trade rather than
holding for large moves. Lock in profits early and cut losses quickly — a fast, reliable small win beats a slow,
uncertain large one. You are expected to complete full buy-then-sell round trips on the same symbol multiple
times in a single day when the signal supports it.

EXCEPTION: you may hold a position longer than the usual scalping target only when several indicators align to
show strong, sustained momentum (e.g. RSI trending with the move and not yet overbought/oversold against it,
price above both MA20 and MA50 with widening distance, volume ratio confirming participation). If you decide to
deviate from the default scalping behavior and hold for a larger move, you MUST say so explicitly in "reason"
(e.g. "Holding beyond scalping target — MA20/MA50/RSI/volume all confirm a strong uptrend").

Your goal is to generate consistent returns in US dollars while managing risk tightly on every trade.
You MUST respond ONLY with valid JSON in this exact format:
{"action":"buy"|"sell"|"hold","quantity":0,"confidence":0.0,"reason":"..."}`,
};

export interface AgentCycleConfig {
  capitalLimit?: number;
  confidenceThreshold?: number;
  intervalMin?: number;
  takeProfitPct?: number;
  stopLossPct?: number;
  feeEstimatePct?: number;
}

const DEFAULT_FEE_ESTIMATE_PCT: Record<'MX' | 'USA', number> = { MX: 0.30, USA: 0.05 };

function sign(n: number): string { return n >= 0 ? '+' : ''; }

interface BuildUserPromptParams {
  symbol: string;
  market: 'MX' | 'USA';
  lastPrice: number;
  changePct: number;
  volume: number;
  lastCyclePrice: number | null;
  indicators: ReturnType<typeof calculateIndicators>;
  closePrices: number[];
  currentPosition: number;
  currentPositionAvgCost: number;
  availableFunds: number;
  capitalLimit: number | undefined;
  effectiveCapital: number;
  netLiquidation: number;
  totalUnrealizedPnl: number;
  intervalMin: number;
  confidenceThreshold: number;
  takeProfitPct: number;
  stopLossPct: number;
  feeEstimatePct: number;
  tradingContext: string;
}

function buildUserPrompt(p: BuildUserPromptParams): string {
  const {
    symbol, market, lastPrice, changePct, volume, lastCyclePrice,
    indicators, closePrices, currentPosition, currentPositionAvgCost,
    availableFunds, capitalLimit, effectiveCapital, netLiquidation,
    totalUnrealizedPnl, intervalMin, confidenceThreshold,
    takeProfitPct, stopLossPct, feeEstimatePct, tradingContext,
  } = p;

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

  // Current position context for the symbol being analyzed — includes this position's own
  // unrealized P&L%, not just buried in the multi-position TRADING CONTEXT dump below
  const symbolUnrealizedPnlPct = currentPosition > 0 && currentPositionAvgCost > 0
    ? ((lastPrice - currentPositionAvgCost) / currentPositionAvgCost) * 100
    : null;

  const positionLine = currentPosition > 0
    ? `${currentPosition} shares already held (avg cost ${currentPositionAvgCost.toFixed(2)} ${currency})` +
      (symbolUnrealizedPnlPct != null
        ? ` — unrealized P&L on this position: ${sign(symbolUnrealizedPnlPct)}${symbolUnrealizedPnlPct.toFixed(2)}%`
        : '')
    : 'no current position';

  // "Since last cycle" intraday momentum proxy — the indicators above are daily-bar based
  // (BMV has no intraday data source at all), so this is the only true intraday signal available.
  const sinceLastCycleLine = lastCyclePrice != null && lastCyclePrice > 0
    ? (() => {
        const pct = ((lastPrice - lastCyclePrice) / lastCyclePrice) * 100;
        return `${sign(pct)}${pct.toFixed(2)}% since the last cycle (was ${lastCyclePrice.toFixed(2)} ${currency}) — short-term intraday momentum; the indicators below are daily-bar based and do not capture moves within today`;
      })()
    : 'first cycle of the day for this symbol — no prior intraday price yet';

  // Take-profit / stop-loss evaluation against the symbol's own current unrealized P&L%
  const tpSlStatusLine = currentPosition > 0 && symbolUnrealizedPnlPct != null
    ? `Current unrealized P&L on this position: ${sign(symbolUnrealizedPnlPct)}${symbolUnrealizedPnlPct.toFixed(2)}% — ` +
      (symbolUnrealizedPnlPct >= takeProfitPct
        ? 'AT OR ABOVE take-profit target — strongly consider selling now.'
        : symbolUnrealizedPnlPct <= -stopLossPct
          ? 'AT OR BELOW stop-loss threshold — strongly consider selling now.'
          : 'within normal range — no TP/SL trigger yet.')
    : 'No open position in this symbol — take-profit/stop-loss do not apply until a position is opened.';

  return `You are being asked to analyze ${symbol} and return a trading decision as JSON.

━━━ CHECK FREQUENCY ━━━
This analysis cycle runs every ${intervalMin} minute${intervalMin === 1 ? '' : 's'} during market hours.
Implication: you will see this symbol again soon. Avoid acting on a marginal signal — wait for the next cycle
if conditions are unclear. This is a scalping strategy: completing multiple full buy-then-sell round trips on
${symbol} across the trading day is expected when signals support it — do not treat an earlier trade today as a
reason to sit out a new signal now. The only thing to avoid is buying more of ${symbol} again immediately after
a recent buy without a genuinely new signal (see TRADING CONTEXT for today's executed trades).

━━━ MARKET DATA ━━━
Symbol    : ${symbol}
Last Price: ${lastPrice.toFixed(2)} ${currency}  — the most recent trade price
Day Change: ${sign(changePct)}${changePct.toFixed(2)}%         — price change vs yesterday's close
Volume    : ${volume.toLocaleString()} shares   — total shares traded so far today
Since Last Cycle: ${sinceLastCycleLine}

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

━━━ RISK MANAGEMENT (TAKE PROFIT / STOP LOSS) ━━━
Take-profit target : +${takeProfitPct.toFixed(2)}% — if you hold ${symbol} and unrealized P&L on this position has reached or passed this level, sell (take the win) unless the EXCEPTION in your system prompt clearly applies and you state so in "reason".
Stop-loss threshold : -${stopLossPct.toFixed(2)}% — if you hold ${symbol} and unrealized P&L on this position has fallen to or past this level, sell to cut the loss. Do not "wait it out" past this threshold.
${tpSlStatusLine}

━━━ TRADING COSTS ━━━
Estimated round-trip cost (fees + spread): ~${feeEstimatePct.toFixed(2)}% of trade value (buy + sell combined for ${market === 'MX' ? 'BMV' : 'US'} trades in this account).
Rule of thumb: only take a trade if your expected edge is at least 2x this cost (~${(feeEstimatePct * 2).toFixed(2)}%) — otherwise fees can erase a small scalping gain. This is why the 0.5%-2% target range exists: it should comfortably clear this cost with room for a real profit.

━━━ TRADING CONTEXT ━━━
${tradingContext}

━━━ DECISION RULES ━━━
1. quantity must be 0 when action is "hold"
2. Never exceed max quantity (${maxQuantity} shares) for a buy
3. Never sell more shares than currently held in ${symbol}
4. Effective capital limit (${effectiveCapital.toFixed(2)} ${currency}) is a hard ceiling — do not exceed it
5. If the portfolio is already heavily invested (>80%), prefer hold over adding new positions unless signal is very strong
6. If you already hold ${symbol}, do not buy more of it right after a recent buy without a genuinely fresh signal (avoid chasing/averaging up mid-signal). Full buy-then-sell round trips on the same symbol are expected and encouraged multiple times per day when the signal supports it — do not treat an earlier trade today as a reason to hold instead of acting on a new signal now.
7. Apply the take-profit and stop-loss levels above: if held and at/above take-profit, prefer sell; if held and at/below stop-loss, prefer sell — unless the EXCEPTION for strong aligned momentum clearly applies (state this explicitly in "reason" if so)
8. Do not take a buy or sell whose expected edge is smaller than roughly 2x the estimated round-trip trading cost above
9. Set confidence < ${confidenceThreshold.toFixed(2)} if conditions are ambiguous; the bot will skip execution below the threshold

Respond with JSON only: {"action":"buy"|"sell"|"hold","quantity":0,"confidence":0.0,"reason":"..."}`;
}

interface ClaudeRequestBody {
  model: string;
  max_tokens: number;
  temperature: number;
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
  config: AgentCycleConfig,
): Promise<AgentRequestContext> {
  const {
    capitalLimit,
    intervalMin = 15,
    confidenceThreshold = 0.65,
    takeProfitPct = 1.5,
    stopLossPct = 1.0,
    feeEstimatePct = DEFAULT_FEE_ESTIMATE_PCT[market],
  } = config;

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

  const [positions, summary, lastCycle] = await Promise.all([
    ibkrClient.getPositions(),
    ibkrClient.getAccountSummary(),
    peekLastPrice(symbol), // read-only — safe for both runAgentCycle and previewAgentRequest
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
    temperature: 0.2,
    system: SYSTEM_PROMPTS[market],
    messages: [
      {
        role: 'user',
        content: buildUserPrompt({
          symbol, market, lastPrice, changePct, volume,
          lastCyclePrice: lastCycle?.price ?? null,
          indicators, closePrices,
          currentPosition, currentPositionAvgCost: currentAvgCost,
          availableFunds, capitalLimit, effectiveCapital,
          netLiquidation: summary.netLiquidation, totalUnrealizedPnl,
          intervalMin, confidenceThreshold,
          takeProfitPct, stopLossPct, feeEstimatePct,
          tradingContext,
        }),
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

  const capitalLimit        = config?.capitalLimit ?? undefined;
  const intervalMin         = config?.intervalMin ?? 15;
  const confidenceThreshold = config?.confidenceThreshold ?? 0.65;
  const takeProfitPct       = config?.takeProfitPct ?? 1.5;
  const stopLossPct         = config?.stopLossPct ?? 1.0;
  const feeEstimatePct      = config?.feeEstimatePct ?? DEFAULT_FEE_ESTIMATE_PCT[market];

  const ctx = await buildAgentRequestContext(symbol, market, {
    capitalLimit, intervalMin, confidenceThreshold, takeProfitPct, stopLossPct, feeEstimatePct,
  });

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
  config: AgentCycleConfig = {},
): Promise<AgentCycleResult> {
  const {
    capitalLimit,
    confidenceThreshold = 0.65,
    intervalMin = 15,
    takeProfitPct = 1.5,
    stopLossPct = 1.0,
    feeEstimatePct = DEFAULT_FEE_ESTIMATE_PCT[market],
  } = config;

  if (!isMarketOpen(market)) {
    return { action: 'hold', quantity: 0, confidence: 0, reason: 'Market is closed', executed: false };
  }

  const ctx = await buildAgentRequestContext(symbol, market, {
    capitalLimit, confidenceThreshold, intervalMin, takeProfitPct, stopLossPct, feeEstimatePct,
  });
  const {
    lastPrice, changePct, volume, indicators,
    currentPosition, effectiveCapital, positions,
  } = ctx;

  // Record this cycle's price for the NEXT real cycle's "since last cycle" comparison.
  // Runs every real cycle (buy/sell/hold) — never called from previewAgentRequest.
  await recordLastPrice(symbol, lastPrice);

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
