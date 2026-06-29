import Anthropic from '@anthropic-ai/sdk';
import { getMXMarketData } from '@/lib/databursatil';
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

function buildUserPrompt(
  symbol: string,
  market: 'MX' | 'USA',
  lastPrice: number,
  changePct: number,
  volume: number,
  indicators: ReturnType<typeof calculateIndicators>,
  currentPosition: number,
  availableFunds: number,
  tradingContext: string
): string {
  const maxInvestment = availableFunds * 0.20;
  const maxQuantity = Math.floor(maxInvestment / lastPrice);
  const currency = market === 'MX' ? 'MXN' : 'USD';

  return `Analyze the following market data for ${symbol} and decide whether to buy, sell, or hold.

MARKET DATA:
- Symbol: ${symbol}
- Last Price: ${lastPrice.toFixed(2)} ${currency}
- Day Change: ${changePct.toFixed(2)}%
- Volume: ${volume.toLocaleString()}

TECHNICAL INDICATORS:
- RSI (14): ${indicators.rsi14.toFixed(2)} (>70 overbought, <30 oversold)
- MA20: ${indicators.ma20.toFixed(2)} ${currency}
- MA50: ${indicators.ma50.toFixed(2)} ${currency}
- 5-Day Change: ${indicators.percentChange5d.toFixed(2)}%
- Volume Ratio vs 20-day avg: ${indicators.volumeRatio.toFixed(2)}x

PORTFOLIO:
- Current position in ${symbol}: ${currentPosition} shares
- Available funds: ${availableFunds.toFixed(2)} ${currency}
- Max allowed investment (20% rule): ${maxInvestment.toFixed(2)} ${currency}
- Max quantity you can buy: ${maxQuantity} shares

TRADING CONTEXT:
${tradingContext}

RULES:
- Never invest more than 20% of available funds in one symbol
- Set confidence = 0 if market conditions are unclear
- quantity must be 0 for "hold" action
- If selling, quantity must not exceed current position (${currentPosition})
- Use trading context to avoid duplicate trades and make better decisions

Respond with JSON only.`;
}

export async function runAgentCycle(
  symbol: string,
  market: 'MX' | 'USA',
  capitalLimit?: number,
  confidenceThreshold = 0.65
): Promise<AgentCycleResult> {
  if (!isMarketOpen(market)) {
    return { action: 'hold', quantity: 0, confidence: 0, reason: 'Market is closed', executed: false };
  }

  // Fetch market data
  let lastPrice: number;
  let changePct: number;
  let volume: number;
  let closePrices: number[];
  let volumes: number[];

  if (market === 'MX') {
    const data = await getMXMarketData(symbol);
    lastPrice = data.lastPrice;
    changePct = data.changePct;
    volume = data.volume;
    closePrices = data.history.map(h => h.close);
    volumes = data.history.map(h => h.volume);
  } else {
    // For USA market, IBKR market data would be fetched here.
    // Placeholder until IBKR market data endpoint is integrated.
    throw new Error('USA market data not yet implemented — set ACTIVE_MARKET=MX for Phase 1');
  }

  const indicators = calculateIndicators(closePrices, volumes);

  // Fetch portfolio state
  const [positions, summary] = await Promise.all([
    ibkrClient.getPositions(),
    ibkrClient.getAccountSummary(),
  ]);

  const currentPosition = positions.find(p => p.ticker === symbol)?.position ?? 0;
  const availableFunds = summary.availableFunds;
  const effectiveCapital = capitalLimit
    ? Math.min(availableFunds, capitalLimit)
    : availableFunds;

  const tradingContext = await buildContextSection(positions);

  // Call Claude
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: SYSTEM_PROMPTS[market],
    messages: [
      {
        role: 'user',
        content: buildUserPrompt(
          symbol, market, lastPrice, changePct, volume,
          indicators, currentPosition, effectiveCapital, tradingContext
        ),
      },
    ],
  });

  const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
  // Strip markdown code fences that the model sometimes wraps around the JSON
  const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let decision: ClaudeDecision;
  try {
    decision = JSON.parse(cleanText) as ClaudeDecision;
  } catch {
    decision = { action: 'hold', quantity: 0, confidence: 0, reason: `Parse error: ${rawText}` };
  }

  // Enforce quantity caps server-side after Claude responds
  const maxInvestment = effectiveCapital * 0.20;
  const maxQuantity = lastPrice > 0 ? Math.floor(maxInvestment / lastPrice) : 0;

  if (decision.action === 'buy' && decision.quantity > maxQuantity) {
    decision.quantity = maxQuantity;
  }
  if (decision.action === 'sell' && decision.quantity > currentPosition) {
    decision.quantity = currentPosition;
  }

  const marketData = { lastPrice, changePct, volume, indicators };
  let executed = false;
  let ibkrOrderId: string | undefined;

  // Log when a buy/sell is skipped due to confidence threshold
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
      message: `${symbol} ${decision.action.toUpperCase()} x${decision.quantity} skipped — confidence ${decision.confidence.toFixed(2)} is below the ${confidenceThreshold.toFixed(2)} threshold`,
      meta: { action: decision.action, quantity: decision.quantity, confidence: decision.confidence, threshold: confidenceThreshold },
    });
  }

  // Execute trade if conditions are met
  if (
    (decision.action === 'buy' || decision.action === 'sell') &&
    decision.confidence >= confidenceThreshold &&
    decision.quantity > 0
  ) {
    const exchange = market === 'MX' ? 'BMV' : 'SMART';

    // Try existing positions first; fall back to contract search for new buys
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
        event: 'cycle_complete',
        market,
        symbol,
        message: `${symbol} ${decision.action.toUpperCase()} signal skipped — contract not found on IBKR (conid lookup failed)`,
      });
    }
  }

  // Persist to database
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
    if (executed) cycleNote = ` — executed (order #${ibkrOrderId ?? ''})`;
    else if (decision.confidence < confidenceThreshold) cycleNote = ` — skipped: confidence ${decision.confidence.toFixed(2)} below ${confidenceThreshold.toFixed(2)} threshold`;
    else if (decision.quantity === 0) cycleNote = ` — skipped: quantity 0`;
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
