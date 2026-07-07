import { CryptoIndicators } from '@/lib/crypto-indicators';

interface ClaudeDecision {
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  confidence: number;
  reason: string;
}

const SYSTEM_PROMPT_CRYPTO = `You are an expert cryptocurrency trader on Bitso, a CNBV-regulated Mexican exchange.
You trade a small, curated list of major coins (e.g. BTC, ETH) against the Mexican peso (MXN). Unlike the stock
markets, crypto trades 24/7 with no open/close — expect higher volatility and thinner order books outside
Mexican business hours.

Your PRIMARY strategy is scalping: take many small, frequent gains of roughly 0.5%-2% per trade rather than
holding for large moves. Lock in profits early and cut losses quickly — a fast, reliable small win beats a slow,
uncertain large one. You are expected to complete full buy-then-sell round trips on the same symbol multiple
times in a single day when the signal supports it.

You do NOT have access to traditional technical indicators (RSI, moving averages) for crypto — instead you are
given the price change since the last time this symbol was checked, the order book imbalance (whether buy or
sell pressure currently dominates), and the bid/ask spread. Use these to judge short-term momentum and whether
the current spread leaves enough room for a profitable round trip after fees.

EXCEPTION: you may hold a position longer than the usual scalping target only when order book imbalance and
recent price momentum both strongly favor continuation. If you decide to deviate from the default scalping
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

  const sinceSnapshotLine = indicators.changePctSinceSnapshot != null && indicators.minutesSinceSnapshot != null
    ? `${sign(indicators.changePctSinceSnapshot)}${indicators.changePctSinceSnapshot.toFixed(2)}% over the last ${indicators.minutesSinceSnapshot.toFixed(0)} minutes — short-term momentum`
    : 'not enough price history yet this hour — treat as a neutral/first read for this symbol';

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
24h High/Low : ${high24h.toFixed(2)} / ${low24h.toFixed(2)} ${currency}
Since Last Check: ${sinceSnapshotLine}

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
Rule of thumb: only take a trade if your expected edge is at least 2x this cost (~${(feeEstimatePct * 2).toFixed(2)}%) — otherwise fees can erase a small scalping gain.

━━━ TRADING CONTEXT ━━━
${recentTradesText}

━━━ DECISION RULES ━━━
1. quantity must be 0 when action is "hold"
2. Never exceed max quantity (${maxQuantity.toFixed(8)} ${baseAsset}) for a buy — fractional quantities are expected and fine
3. Never sell more than currently held in ${symbol} (${currentPosition.toFixed(8)} ${baseAsset})
4. Effective capital limit (${effectiveCapital.toFixed(2)} ${currency}) is a hard ceiling — do not exceed it
5. If the portfolio is already heavily invested (>80%), prefer hold over adding new positions unless signal is very strong
6. If you already hold ${symbol}, do not buy more of it right after a recent buy without a genuinely fresh signal. Full buy-then-sell round trips on the same symbol are expected multiple times per day when the signal supports it.
7. Apply the take-profit and stop-loss levels above: if held and at/above take-profit, prefer sell; if held and at/below stop-loss, prefer sell — unless the EXCEPTION for strong aligned momentum clearly applies (state this explicitly in "reason" if so)
8. Do not take a buy or sell whose expected edge is smaller than roughly 2x the estimated round-trip trading cost above
9. Set confidence < ${confidenceThreshold.toFixed(2)} if conditions are ambiguous; the bot will skip execution below the threshold

Respond with JSON only: {"action":"buy"|"sell"|"hold","quantity":0,"confidence":0.0,"reason":"..."}`;
}
