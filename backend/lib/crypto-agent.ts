import Anthropic from '@anthropic-ai/sdk';
import { CryptoIndicators } from '@/lib/crypto-indicators';
import { bitsoClient } from '@/lib/bitso';
import { getCryptoMarketData, recordCryptoPriceSnapshot } from '@/lib/bitso-market-data';
import { prisma } from '@/lib/prisma';
import { writeBotLog } from '@/lib/bot-logger';
import { ClaudeDecision, parseClaudeDecision } from '@/lib/claude-decision-parser';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AgentCycleResult {
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  confidence: number;
  reason: string;
  executed: boolean;
}

const SYSTEM_PROMPT_CRYPTO = `You are an expert cryptocurrency trader on Bitso, a CNBV-regulated Mexican exchange.
You trade a small, curated list of major coins (e.g. BTC, ETH) against the Mexican peso (MXN). Unlike the stock
markets, crypto trades 24/7 with no open/close — expect higher volatility and thinner order books outside
Mexican business hours.

Your PRIMARY strategy is scalping, but calibrated to crypto's volatility rather than a stock's: take frequent,
worthwhile gains rather than holding for one large move, but do not treat a stock-scalping target (a fraction of
a percent) as the bar here — crypto routinely moves several percent within a few hours. The exact per-trade
target is set each cycle by the configured take-profit and stop-loss levels below; treat those numbers as
authoritative, not a fixed range you should assume. Lock in profits at the target and cut losses at the stop
promptly. You are expected to complete full buy-then-sell round trips on the same symbol multiple times when the
signal supports it — but each entry still needs a real basis; do not buy simply because capital is available.

You do NOT have access to traditional technical indicators (RSI, moving averages) for crypto. Instead you are
given THREE momentum reads at different horizons — a since-last-cycle tick (short, can be noisy on its own),
a several-hour trend (the more reliable read for judging real direction), and the 24h change plus 24h high/low
(broader context, and where the price sits relative to recent extremes) — plus the order book imbalance (whether
buy or sell pressure currently dominates) and the bid/ask spread. Weight the multi-hour trend and order book
imbalance together as your primary signal; do not act on the short-term tick alone, and be cautious about buying
very close to the 24h high (already extended) or selling very close to the 24h low (may be a support bounce)
unless the trend and order flow clearly justify it.

EXCEPTION: you may hold a position longer than the configured take-profit target only when the multi-hour trend
and order book imbalance both strongly favor continuation. If you decide to deviate from the default scalping
behavior and hold for a larger move, you MUST say so explicitly in "reason".

Your goal is to generate consistent returns in Mexican pesos while managing risk tightly on every trade.
You MUST respond ONLY with valid JSON in this exact format:
{"action":"buy"|"sell"|"hold","quantity":0,"confidence":0.0,"reason":"..."}`;

function sign(n: number): string { return n >= 0 ? '+' : ''; }

interface BuildCryptoUserPromptParams {
  symbol: string; // Bitso book, e.g. "btc_mxn"
  lastPrice: number;
  changePct24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  indicators: CryptoIndicators;
  currentPosition: number; // fractional coin quantity held
  currentPositionAvgCost: number;
  availableFunds: number; // MXN cash
  capitalLimit: number | undefined;
  effectiveCapital: number;
  netLiquidation: number;
  totalUnrealizedPnl: number;
  intervalMin: number;
  confidenceThreshold: number;
  takeProfitPct: number;
  stopLossPct: number;
  feeEstimatePct: number;
  recentTradesText: string;
}

function buildCryptoUserPrompt(p: BuildCryptoUserPromptParams): string {
  const {
    symbol, lastPrice, changePct24h, volume24h, high24h, low24h, indicators,
    currentPosition, currentPositionAvgCost, availableFunds, capitalLimit,
    effectiveCapital, netLiquidation, totalUnrealizedPnl, intervalMin,
    confidenceThreshold, takeProfitPct, stopLossPct, feeEstimatePct, recentTradesText,
  } = p;

  const currency = 'MXN';
  const baseAsset = symbol.split('_')[0].toUpperCase();
  const maxInvestment = effectiveCapital * 0.20;
  const maxQuantity = lastPrice > 0 ? maxInvestment / lastPrice : 0;

  const symbolUnrealizedPnlPct = currentPosition > 0 && currentPositionAvgCost > 0
    ? ((lastPrice - currentPositionAvgCost) / currentPositionAvgCost) * 100
    : null;

  const positionLine = currentPosition > 0
    ? `${currentPosition.toFixed(8)} ${baseAsset} already held (avg cost ${currentPositionAvgCost.toFixed(2)} ${currency})` +
      (symbolUnrealizedPnlPct != null
        ? ` — unrealized P&L on this position: ${sign(symbolUnrealizedPnlPct)}${symbolUnrealizedPnlPct.toFixed(2)}%`
        : '')
    : 'no current position';

  const sinceLastCycleLine = indicators.changePctSinceLastCycle != null && indicators.minutesSinceLastCycle != null
    ? `${sign(indicators.changePctSinceLastCycle)}${indicators.changePctSinceLastCycle.toFixed(2)}% over the last ${indicators.minutesSinceLastCycle.toFixed(0)} minute${indicators.minutesSinceLastCycle < 1.5 ? '' : 's'} — most recent tick; can be noisy on its own, do not act on this alone`
    : 'first cycle of the day for this symbol — no prior snapshot yet';

  const trendLine = indicators.changePctSinceSnapshot != null && indicators.minutesSinceSnapshot != null
    ? `${sign(indicators.changePctSinceSnapshot)}${indicators.changePctSinceSnapshot.toFixed(2)}% over the last ${indicators.minutesSinceSnapshot.toFixed(0)} minutes — the more reliable read for judging real direction; weight this over the single tick above`
    : 'not enough price history yet — treat as a neutral/first read for this symbol';

  const distFromHigh24h = high24h > 0 ? ((lastPrice - high24h) / high24h) * 100 : 0;
  const distFromLow24h = low24h > 0 ? ((lastPrice - low24h) / low24h) * 100 : 0;

  const imbalanceLabel = indicators.orderBookImbalance > 0.2
    ? 'buy pressure dominates'
    : indicators.orderBookImbalance < -0.2
      ? 'sell pressure dominates'
      : 'roughly balanced';

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
This analysis cycle runs every ${intervalMin} minute${intervalMin === 1 ? '' : 's'}, 24/7 (crypto never closes).
Implication: you will see this symbol again soon. Avoid acting on a marginal signal — wait for the next cycle
if conditions are unclear. This is a scalping strategy: completing multiple full buy-then-sell round trips on
${symbol} across the day is expected when signals support it — do not treat an earlier trade today as a
reason to sit out a new signal now.

━━━ MARKET DATA ━━━
Symbol       : ${symbol}
Last Price   : ${lastPrice.toFixed(2)} ${currency}
24h Change   : ${sign(changePct24h)}${changePct24h.toFixed(2)}%
24h Volume   : ${volume24h.toFixed(4)} ${baseAsset}
24h High/Low : ${high24h.toFixed(2)} / ${low24h.toFixed(2)} ${currency}  → price is ${sign(distFromHigh24h)}${distFromHigh24h.toFixed(1)}% from the 24h high, ${sign(distFromLow24h)}${distFromLow24h.toFixed(1)}% from the 24h low
  Interpretation: near the 24h high = potential resistance/already extended; near the 24h low = potential support/oversold bounce
Since Last Cycle : ${sinceLastCycleLine}
Recent Trend      : ${trendLine}

━━━ ORDER BOOK ━━━
Order Book Imbalance: ${indicators.orderBookImbalance.toFixed(2)} (-1 = all sell pressure, +1 = all buy pressure) → ${imbalanceLabel}
Bid/Ask Spread      : ${indicators.spreadPct.toFixed(3)}% — wider spread eats into round-trip profit; factor this in alongside fees below

━━━ CAPITAL FOR THIS CYCLE ━━━
Capital limit per cycle : ${capitalLimit != null ? `${capitalLimit.toFixed(2)} ${currency}` : 'not set (no cap)'}
  — This is the absolute maximum the user allows to deploy in a single bot cycle. Do not exceed it.
Available funds         : ${availableFunds.toFixed(2)} ${currency}
Effective capital       : ${effectiveCapital.toFixed(2)} ${currency}  — min(capital limit, available funds); your actual budget
Max per position (20%)  : ${maxInvestment.toFixed(2)} ${currency}  — hard cap per symbol = 20% of effective capital
Max quantity you can buy: ${maxQuantity.toFixed(8)} ${baseAsset}  — max per position / last price (fractional amounts are fine)

━━━ POSITION ━━━
Net value (cash + this position): ${netLiquidation.toFixed(2)} ${currency}
Total Unrealized P&L            : ${sign(totalUnrealizedPnl)}${totalUnrealizedPnl.toFixed(2)} ${currency}
Current position in ${symbol}: ${positionLine}

━━━ RISK MANAGEMENT (TAKE PROFIT / STOP LOSS) ━━━
Take-profit target : +${takeProfitPct.toFixed(2)}% — if you hold ${symbol} and unrealized P&L on this position has reached or passed this level, sell (take the win) unless the EXCEPTION in your system prompt clearly applies and you state so in "reason".
Stop-loss threshold : -${stopLossPct.toFixed(2)}% — if you hold ${symbol} and unrealized P&L on this position has fallen to or past this level, sell to cut the loss. Do not "wait it out" past this threshold.
${tpSlStatusLine}

━━━ TRADING COSTS ━━━
Estimated round-trip cost (fees + spread): ~${feeEstimatePct.toFixed(2)}% of trade value (buy + sell combined, Bitso taker fees).
Rule of thumb: only take a trade if your expected edge is at least 2x this cost (~${(feeEstimatePct * 2).toFixed(2)}%) — otherwise fees can erase the gain.

━━━ TRADING CONTEXT ━━━
${recentTradesText}

━━━ DECISION RULES ━━━
1. quantity must be 0 when action is "hold"
2. Never exceed max quantity (${maxQuantity.toFixed(8)} ${baseAsset}) for a buy — fractional quantities are expected and fine
3. Never sell more than currently held in ${symbol} (${currentPosition.toFixed(8)} ${baseAsset})
4. Effective capital limit (${effectiveCapital.toFixed(2)} ${currency}) is a hard ceiling — do not exceed it
5. If the portfolio is already heavily invested (>80%), prefer hold over adding new positions unless signal is very strong
6. If you already hold ${symbol}, do not buy more of it right after a recent buy without a genuinely fresh signal. Full buy-then-sell round trips on the same symbol are expected multiple times per day when the signal supports it.
7. Apply the take-profit and stop-loss levels above: if held and at/above take-profit, prefer sell; if held and at/below stop-loss, prefer sell — unless the EXCEPTION for a strongly aligned multi-hour trend and order book clearly applies (state this explicitly in "reason" if so)
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

const DEFAULT_CRYPTO_FEE_ESTIMATE_PCT = 0.65; // round-trip fallback if getFees() can't be reached; overridden per-book below when available

// Crypto-specific fallbacks, used only when a market has no saved BotConfig
// row yet (fresh install / previewCryptoAgentRequest before first save).
// Wider than the stock defaults (1.5% / 1.0% / 0.65) because crypto
// routinely moves several percent within a few hours — a stock-sized 1%
// stop gets whipsawed by ordinary noise before a real move has room to
// develop, and a 1.5% target barely clears 2x this market's ~0.65%+
// round-trip taker fee. ~2:1 reward:risk, and a slightly lower confidence
// bar reflecting that crypto's only signals (order book imbalance, price
// trend) are inherently noisier than a stock's RSI/MA/volume bundle.
const DEFAULT_CRYPTO_TAKE_PROFIT_PCT = 5.0;
const DEFAULT_CRYPTO_STOP_LOSS_PCT = 2.5;
const DEFAULT_CRYPTO_CONFIDENCE_THRESHOLD = 0.60;

interface TradeForAvgCost {
  action: string;
  quantity: number;
  price: number;
  createdAt: Date;
}

// Bitso's balance endpoint reports total holdings but not cost basis, so avg
// cost is derived from this app's own recorded buy/sell trades for the
// symbol — a FIFO walk over the still-open quantity, same technique pnl.ts
// uses for realized P&L. Bounded to the last 200 trades for this symbol,
// which comfortably covers the curated small-symbol-list MVP.
function computeAvgCostFromTrades(trades: TradeForAvgCost[], currentPosition: number): number {
  if (currentPosition <= 0) return 0;
  const sorted = [...trades].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const lots: { quantity: number; price: number }[] = [];
  for (const t of sorted) {
    if (t.action === 'buy') {
      lots.push({ quantity: t.quantity, price: t.price });
    } else if (t.action === 'sell') {
      let remaining = t.quantity;
      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0];
        const matched = Math.min(lot.quantity, remaining);
        lot.quantity -= matched;
        remaining -= matched;
        if (lot.quantity <= 0) lots.shift();
      }
    }
  }
  const totalQty = lots.reduce((sum, l) => sum + l.quantity, 0);
  if (totalQty <= 0) return 0;
  const totalCost = lots.reduce((sum, l) => sum + l.quantity * l.price, 0);
  return totalCost / totalQty;
}

export interface CryptoAgentRequestContext {
  request: ClaudeRequestBody;
  lastPrice: number;
  changePct24h: number;
  volume24h: number;
  indicators: CryptoIndicators;
  currentPosition: number;
  currentAvgCost: number;
  availableFunds: number;
  effectiveCapital: number;
  netLiquidation: number;
  totalUnrealizedPnl: number;
}

interface CryptoAgentCycleConfig {
  capitalLimit?: number;
  confidenceThreshold?: number;
  intervalMin?: number;
  takeProfitPct?: number;
  stopLossPct?: number;
  feeEstimatePct?: number;
  tpSlBypassEnabled?: boolean;
}

async function buildCryptoAgentRequestContext(
  symbol: string,
  config: CryptoAgentCycleConfig,
): Promise<CryptoAgentRequestContext> {
  const {
    capitalLimit,
    intervalMin = 15,
    confidenceThreshold = DEFAULT_CRYPTO_CONFIDENCE_THRESHOLD,
    takeProfitPct = DEFAULT_CRYPTO_TAKE_PROFIT_PCT,
    stopLossPct = DEFAULT_CRYPTO_STOP_LOSS_PCT,
  } = config;

  const marketData = await getCryptoMarketData(symbol);
  const [baseCurrency, quoteCurrency] = symbol.split('_');

  // getBalances/getFees are both authenticated Bitso calls and must not run
  // concurrently via Promise.all — Bitso requires strictly increasing nonces
  // per API key, so parallel calls risk colliding/out-of-order nonces and
  // getting rejected. Serialize them; the unrelated Prisma trade query is
  // still overlapped for what parallelism remains safe.
  const tradesPromise = prisma.trade.findMany({
    where: { market: 'CRYPTO', symbol },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const balances = await bitsoClient.getBalances();
  const fees = await bitsoClient.getFees();
  const recentTrades = await tradesPromise;

  const baseBalance  = balances.find(b => b.currency === baseCurrency);
  const quoteBalance = balances.find(b => b.currency === quoteCurrency);
  const currentPosition = baseBalance?.total ?? 0;

  const bookFee = fees.find(f => f.book === symbol);
  // Live Bitso fee wins whenever the API call succeeded for this book — a
  // non-null config.feeEstimatePct (it has a DB default) would otherwise
  // always shadow the real, current fee schedule. Fall back to the config
  // value, then the constant, only when the live lookup has nothing for this book.
  const feeEstimatePct = (bookFee ? bookFee.takerFeeDecimal * 100 * 2 : undefined)
    ?? config.feeEstimatePct
    ?? DEFAULT_CRYPTO_FEE_ESTIMATE_PCT;

  const availableFunds   = quoteBalance?.available ?? 0;
  const effectiveCapital = capitalLimit ? Math.min(availableFunds, capitalLimit) : availableFunds;
  const currentAvgCost   = computeAvgCostFromTrades(recentTrades, currentPosition);
  const totalUnrealizedPnl = currentPosition > 0 && currentAvgCost > 0
    ? (marketData.lastPrice - currentAvgCost) * currentPosition
    : 0;
  const netLiquidation = availableFunds + currentPosition * marketData.lastPrice;

  const recentTradesText = recentTrades.length > 0
    ? "RECENT TRADES (last 10):\n" + recentTrades
        .slice(0, 10)
        .slice()
        .reverse()
        .map(t => `• ${t.createdAt.toISOString()}  ${t.action.toUpperCase()} ${symbol} ×${t.quantity} @ ${t.price.toFixed(2)} MXN`)
        .join('\n')
    : 'RECENT TRADES: none yet for this symbol';

  const request: ClaudeRequestBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    temperature: 0.2,
    system: SYSTEM_PROMPT_CRYPTO,
    messages: [
      {
        role: 'user',
        content: buildCryptoUserPrompt({
          symbol,
          lastPrice: marketData.lastPrice,
          changePct24h: marketData.changePct24h,
          volume24h: marketData.volume24h,
          high24h: marketData.high24h,
          low24h: marketData.low24h,
          indicators: marketData.indicators,
          currentPosition,
          currentPositionAvgCost: currentAvgCost,
          availableFunds,
          capitalLimit,
          effectiveCapital,
          netLiquidation,
          totalUnrealizedPnl,
          intervalMin,
          confidenceThreshold,
          takeProfitPct,
          stopLossPct,
          feeEstimatePct,
          recentTradesText,
        }),
      },
    ],
  };

  return {
    request,
    lastPrice: marketData.lastPrice,
    changePct24h: marketData.changePct24h,
    volume24h: marketData.volume24h,
    indicators: marketData.indicators,
    currentPosition,
    currentAvgCost,
    availableFunds,
    effectiveCapital,
    netLiquidation,
    totalUnrealizedPnl,
  };
}

export interface CryptoAgentRequestPreview {
  symbol: string;
  market: 'CRYPTO';
  readable: {
    lastPrice: number;
    changePct24h: number;
    volume24h: number;
    currency: string;
    orderBookImbalance: number;
    spreadPct: number;
    changePctSinceLastCycle: number | null;
    changePctTrend: number | null;
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

export async function previewCryptoAgentRequest(): Promise<CryptoAgentRequestPreview> {
  const config = await prisma.botConfig.findUnique({ where: { market: 'CRYPTO' } });
  const symbol = config?.symbols?.[0];
  if (!symbol) {
    throw new Error('No symbols configured for CRYPTO — add at least one symbol in Bot Config first');
  }

  const capitalLimit        = config?.capitalLimit ?? undefined;
  const intervalMin         = config?.intervalMin ?? 15;
  const confidenceThreshold = config?.confidenceThreshold ?? DEFAULT_CRYPTO_CONFIDENCE_THRESHOLD;
  const takeProfitPct       = config?.takeProfitPct ?? DEFAULT_CRYPTO_TAKE_PROFIT_PCT;
  const stopLossPct         = config?.stopLossPct ?? DEFAULT_CRYPTO_STOP_LOSS_PCT;
  const feeEstimatePct      = config?.feeEstimatePct ?? undefined;

  const ctx = await buildCryptoAgentRequestContext(symbol, {
    capitalLimit, intervalMin, confidenceThreshold, takeProfitPct, stopLossPct, feeEstimatePct,
  });

  return {
    symbol,
    market: 'CRYPTO',
    readable: {
      lastPrice: ctx.lastPrice,
      changePct24h: ctx.changePct24h,
      volume24h: ctx.volume24h,
      currency: 'MXN',
      orderBookImbalance: ctx.indicators.orderBookImbalance,
      spreadPct: ctx.indicators.spreadPct,
      changePctSinceLastCycle: ctx.indicators.changePctSinceLastCycle,
      changePctTrend: ctx.indicators.changePctSinceSnapshot,
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

export async function runCryptoAgentCycle(
  symbol: string,
  config: CryptoAgentCycleConfig = {},
): Promise<AgentCycleResult> {
  const {
    confidenceThreshold = DEFAULT_CRYPTO_CONFIDENCE_THRESHOLD,
    takeProfitPct = DEFAULT_CRYPTO_TAKE_PROFIT_PCT,
    stopLossPct = DEFAULT_CRYPTO_STOP_LOSS_PCT,
    tpSlBypassEnabled = false,
  } = config;

  const ctx = await buildCryptoAgentRequestContext(symbol, config);
  const { lastPrice, indicators, currentPosition, currentAvgCost, effectiveCapital } = ctx;

  // Record this cycle's price for the NEXT real cycle's "since last check" comparison.
  // Runs every real cycle (buy/sell/hold) — never called from previewCryptoAgentRequest.
  await recordCryptoPriceSnapshot(symbol, ctx.lastPrice);

  // Deterministic TP/SL bypass — see the matching block in claude-agent.ts's
  // runAgentCycle for the full rationale. Sells the whole position via Bitso
  // directly, skipping the Claude call, whenever unrealized P&L has clearly
  // reached the take-profit or stop-loss level. Opt-in per market via
  // BotConfig.tpSlBypassEnabled.
  if (tpSlBypassEnabled && currentPosition > 0 && currentAvgCost > 0) {
    const unrealizedPnlPct = ((lastPrice - currentAvgCost) / currentAvgCost) * 100;
    const trigger: 'take-profit' | 'stop-loss' | null =
      unrealizedPnlPct >= takeProfitPct ? 'take-profit' :
      unrealizedPnlPct <= -stopLossPct  ? 'stop-loss' :
      null;

    if (trigger) {
      const targetLabel = trigger === 'take-profit' ? `+${takeProfitPct.toFixed(2)}%` : `-${stopLossPct.toFixed(2)}%`;
      const reason = `Deterministic ${trigger} bypass: unrealized P&L ${sign(unrealizedPnlPct)}${unrealizedPnlPct.toFixed(2)}% vs ${targetLabel} target — sold without a Claude call.`;
      const decision: ClaudeDecision = { action: 'sell', quantity: currentPosition, confidence: 1, reason };

      let executed = false;
      let orderId: string | undefined;
      try {
        orderId = await bitsoClient.placeOrder({ book: symbol, side: 'sell', major: currentPosition.toFixed(8) });
        executed = true;
        await writeBotLog({
          level: 'info',
          event: 'order_placed',
          market: 'CRYPTO',
          symbol,
          message: `${symbol} SELL x${currentPosition} @ ${lastPrice.toFixed(2)} MXN — order #${orderId} (${trigger} bypass, no Claude call)`,
        });
      } catch (err) {
        await writeBotLog({
          level: 'warn',
          event: 'order_skipped',
          market: 'CRYPTO',
          symbol,
          message: `${symbol} SELL x${currentPosition} — Bitso rejected: ${(err as Error).message} (${trigger} bypass)`,
          meta: { action: 'sell', quantity: currentPosition, bypass: true, trigger },
        });
      }

      await prisma.agentLog.create({
        data: {
          symbol,
          market: 'CRYPTO',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          marketData: JSON.parse(JSON.stringify({ lastPrice, indicators })),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          response: JSON.parse(JSON.stringify(decision)),
          executed,
        },
      });

      await writeBotLog({
        level: 'info',
        event: 'cycle_complete',
        market: 'CRYPTO',
        symbol,
        message: `${symbol} → SELL x${currentPosition} (${trigger} bypass, no Claude call)${executed ? ` — executed (order #${orderId ?? ''})` : ' — order skipped'}`,
        meta: { action: 'sell', quantity: currentPosition, bypass: true, trigger, executed },
      });

      if (executed) {
        await prisma.trade.create({
          data: {
            symbol,
            market: 'CRYPTO',
            action: 'sell',
            quantity: currentPosition,
            price: lastPrice,
            currency: 'MXN',
            reason,
            ibkrOrderId: orderId,
          },
        });
      }

      return { ...decision, executed };
    }
  }

  const message = await anthropic.messages.create(ctx.request);

  const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
  const decision: ClaudeDecision = parseClaudeDecision(rawText);

  const maxInvestment = effectiveCapital * 0.20;
  const maxQuantity   = lastPrice > 0 ? maxInvestment / lastPrice : 0;

  if (decision.action === 'buy'  && decision.quantity > maxQuantity)     decision.quantity = maxQuantity;
  if (decision.action === 'sell' && decision.quantity > currentPosition) decision.quantity = currentPosition;

  let executed = false;
  let orderId: string | undefined;

  if (
    (decision.action === 'buy' || decision.action === 'sell') &&
    decision.confidence < confidenceThreshold &&
    decision.quantity > 0
  ) {
    await writeBotLog({
      level: 'warn',
      event: 'order_skipped',
      market: 'CRYPTO',
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
    try {
      orderId = await bitsoClient.placeOrder({
        book: symbol,
        side: decision.action,
        // Round to 8 decimals to match this feature's display precision
        // (maxQuantity.toFixed(8) / currentPosition.toFixed(8) in the prompt)
        // and avoid sending unrounded float precision that exceeds a book's
        // allowed decimals. Pragmatic MVP simplification — exact per-book
        // precision would require a live call to Bitso's `available_books`
        // endpoint, which is not yet integrated.
        major: decision.quantity.toFixed(8),
      });
      executed = true;
      await writeBotLog({
        level: 'info',
        event: 'order_placed',
        market: 'CRYPTO',
        symbol,
        message: `${symbol} ${decision.action.toUpperCase()} x${decision.quantity} @ ${lastPrice.toFixed(2)} MXN — order #${orderId}`,
      });
    } catch (err) {
      await writeBotLog({
        level: 'warn',
        event: 'order_skipped',
        market: 'CRYPTO',
        symbol,
        message: `${symbol} ${decision.action.toUpperCase()} x${decision.quantity} — Bitso rejected: ${(err as Error).message}`,
        meta: { action: decision.action, quantity: decision.quantity },
      });
    }
  }

  await prisma.agentLog.create({
    data: {
      symbol,
      market: 'CRYPTO',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      marketData: JSON.parse(JSON.stringify({ lastPrice, indicators })),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: JSON.parse(JSON.stringify(decision)),
      executed,
    },
  });

  let cycleNote = '';
  if (decision.action !== 'hold') {
    if (executed)                                      cycleNote = ` — executed (order #${orderId ?? ''})`;
    else if (decision.confidence < confidenceThreshold) cycleNote = ` — skipped: confidence ${decision.confidence.toFixed(2)} below ${confidenceThreshold.toFixed(2)} threshold`;
    else if (decision.quantity === 0)                  cycleNote = ` — skipped: quantity 0`;
  }

  await writeBotLog({
    level: 'info',
    event: 'cycle_complete',
    market: 'CRYPTO',
    symbol,
    message: `${symbol} → ${decision.action.toUpperCase()} x${decision.quantity} (confidence ${decision.confidence.toFixed(2)})${cycleNote}`,
    meta: { action: decision.action, quantity: decision.quantity, confidence: decision.confidence, executed },
  });

  if (executed) {
    await prisma.trade.create({
      data: {
        symbol,
        market: 'CRYPTO',
        action: decision.action,
        quantity: decision.quantity,
        price: lastPrice,
        currency: 'MXN',
        reason: decision.reason,
        // Trade.ibkrOrderId is a generically-named opaque order-id column —
        // reused here for the Bitso order id rather than adding a new column
        // or renaming it (renaming would require touching claude-agent.ts's
        // MX/USA usages of the same field, which this plan avoids).
        ibkrOrderId: orderId,
      },
    });
  }

  return { ...decision, executed };
}
