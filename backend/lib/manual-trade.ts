import { Trade } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Market } from '@/lib/market';
import { isMarketOpen } from '@/lib/market-hours';
import { ibkrClient } from '@/lib/ibkr';
import { bitsoClient } from '@/lib/bitso';
import { getMXMarketData } from '@/lib/databursatil';
import { getUSAMarketData } from '@/lib/ibkr-market-data';

export interface ManualTradeParams {
  market: Market;
  symbol: string;
  side: 'buy' | 'sell';
  quantity?: number;   // required for MX/USA
  mxnAmount?: number;  // required for CRYPTO
  placedByEmail: string;
}

// `trade` is the full Prisma row (prisma.trade.create returns every
// column by default) — deliberately not narrowed to a few fields, since
// the frontend's ManualTradeService (Task 5) types its response as the
// full Trade model and a narrowed subset here would silently violate that.
export interface ManualTradeResult {
  success: boolean;
  trade?: Trade;
  error?: string;
  errorType?: 'validation' | 'broker_rejected';
}

export async function executeManualTrade(params: ManualTradeParams): Promise<ManualTradeResult> {
  if (params.market === 'CRYPTO') return executeCryptoManualTrade(params);
  return executeStockManualTrade(params);
}

async function executeStockManualTrade(params: ManualTradeParams): Promise<ManualTradeResult> {
  const { market, symbol, side, quantity, placedByEmail } = params;

  if (!isMarketOpen(market)) {
    return { success: false, error: `${market} market is closed`, errorType: 'validation' };
  }
  if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
    return { success: false, error: 'quantity must be a positive whole number of shares', errorType: 'validation' };
  }

  const positions = await ibkrClient.getPositions();
  const existingPosition = positions.find(p => p.ticker === symbol);

  if (side === 'sell') {
    const held = existingPosition?.position ?? 0;
    if (quantity > held) {
      return { success: false, error: `cannot sell ${quantity} shares — only ${held} held`, errorType: 'validation' };
    }
  }

  let conid = existingPosition?.conid;
  if (!conid) {
    const exchange = market === 'MX' ? 'BMV' : 'SMART';
    conid = (await ibkrClient.searchConid(symbol, exchange)) ?? undefined;
  }
  if (!conid) {
    return { success: false, error: `could not find a tradeable contract for ${symbol} on ${market}`, errorType: 'validation' };
  }

  const marketData = market === 'MX' ? await getMXMarketData(symbol) : await getUSAMarketData(symbol);
  const lastPrice = marketData.lastPrice;

  if (side === 'buy') {
    const summary = await ibkrClient.getAccountSummary();
    const estimatedCost = quantity * lastPrice;
    if (estimatedCost > summary.availableFunds) {
      return {
        success: false,
        error: `insufficient funds — need ~${estimatedCost.toFixed(2)}, have ${summary.availableFunds.toFixed(2)}`,
        errorType: 'validation',
      };
    }
  }

  const ibkrOrderId = await ibkrClient.placeOrder({
    conid, side: side === 'buy' ? 'BUY' : 'SELL', quantity, market: market as 'MX' | 'USA',
  });
  if (!ibkrOrderId) {
    return { success: false, error: 'IBKR rejected the order', errorType: 'broker_rejected' };
  }

  const trade = await prisma.trade.create({
    data: {
      symbol, market, action: side, quantity, price: lastPrice,
      currency: market === 'MX' ? 'MXN' : 'USD',
      reason: `Manual ${side} by ${placedByEmail}`,
      ibkrOrderId, source: 'manual', placedByEmail,
    },
  });

  return { success: true, trade };
}

async function executeCryptoManualTrade(params: ManualTradeParams): Promise<ManualTradeResult> {
  const { symbol, side, mxnAmount, placedByEmail } = params;

  if (!mxnAmount || mxnAmount <= 0) {
    return { success: false, error: 'amount must be a positive MXN amount', errorType: 'validation' };
  }

  const ticker = await bitsoClient.getTicker(symbol);
  const lastPrice = ticker.last;
  const coinQuantity = mxnAmount / lastPrice;

  const balances = await bitsoClient.getBalances();

  if (side === 'buy') {
    const mxnBalance = balances.find(b => b.currency === 'mxn')?.available ?? 0;
    if (mxnAmount > mxnBalance) {
      return {
        success: false,
        error: `insufficient MXN balance — need ${mxnAmount.toFixed(2)}, have ${mxnBalance.toFixed(2)}`,
        errorType: 'validation',
      };
    }
  } else {
    const baseCurrency = symbol.split('_')[0];
    const heldQuantity = balances.find(b => b.currency === baseCurrency)?.available ?? 0;
    if (coinQuantity > heldQuantity) {
      return {
        success: false,
        error: `insufficient ${baseCurrency.toUpperCase()} balance — need ${coinQuantity.toFixed(8)}, have ${heldQuantity.toFixed(8)}`,
        errorType: 'validation',
      };
    }
  }

  const orderId = await bitsoClient.placeOrder({ book: symbol, side, major: coinQuantity.toFixed(8) });
  if (!orderId) {
    return { success: false, error: 'Bitso rejected the order', errorType: 'broker_rejected' };
  }

  const trade = await prisma.trade.create({
    data: {
      symbol, market: 'CRYPTO', action: side, quantity: coinQuantity, price: lastPrice,
      currency: 'MXN',
      reason: `Manual ${side} by ${placedByEmail}`,
      // Trade.ibkrOrderId is a generically-named opaque order-id column,
      // already reused for Bitso order ids by crypto-agent.ts — same
      // convention here rather than adding a new column.
      ibkrOrderId: orderId, source: 'manual', placedByEmail,
    },
  });

  return { success: true, trade };
}
