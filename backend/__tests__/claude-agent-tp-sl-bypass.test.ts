// Tests the deterministic TP/SL bypass path in runAgentCycle (claude-agent.ts).
// Everything runAgentCycle touches is mocked — market data, IBKR, Prisma,
// bot logging, and the Anthropic client itself — so these tests assert
// purely on whether Claude gets called and what order/records result,
// without hitting any real network or database.

const mockAnthropicCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  }));
});

jest.mock('@/lib/databursatil', () => ({
  getMXMarketData: jest.fn(),
}));

jest.mock('@/lib/ibkr-market-data', () => ({
  getUSAMarketData: jest.fn(),
}));

jest.mock('@/lib/ibkr', () => ({
  ibkrClient: {
    getPositions: jest.fn(),
    getAccountSummary: jest.fn(),
    searchConid: jest.fn(),
    placeOrder: jest.fn(),
  },
}));

jest.mock('@/lib/indicators', () => ({
  calculateIndicators: jest.fn(),
}));

jest.mock('@/lib/market-hours', () => ({
  isMarketOpen: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    agentLog: { create: jest.fn() },
    trade: { create: jest.fn() },
    botConfig: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/bot-logger', () => ({
  writeBotLog: jest.fn(),
}));

jest.mock('@/lib/trading-context', () => ({
  buildContextSection: jest.fn().mockResolvedValue('TRADING CONTEXT: none'),
  recordTrade: jest.fn(),
  peekLastPrice: jest.fn().mockResolvedValue(null),
  recordLastPrice: jest.fn(),
}));

jest.mock('@/lib/crypto-agent', () => ({
  previewCryptoAgentRequest: jest.fn(),
  runCryptoAgentCycle: jest.fn(),
}));

import { runAgentCycle } from '@/lib/claude-agent';
import { getMXMarketData } from '@/lib/databursatil';
import { ibkrClient } from '@/lib/ibkr';
import { calculateIndicators } from '@/lib/indicators';
import { isMarketOpen } from '@/lib/market-hours';
import { prisma } from '@/lib/prisma';

const mockIndicators = { rsi14: 50, ma20: 100, ma50: 100, percentChange5d: 0, volumeRatio: 1 };

function claudeHoldResponse(reason: string, confidence = 0.5) {
  return { content: [{ type: 'text', text: JSON.stringify({ action: 'hold', quantity: 0, confidence, reason }) }] };
}

describe('runAgentCycle — deterministic TP/SL bypass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isMarketOpen as jest.Mock).mockReturnValue(true);
    (calculateIndicators as jest.Mock).mockReturnValue(mockIndicators);
    (getMXMarketData as jest.Mock).mockResolvedValue({
      symbol: 'AMXL',
      lastPrice: 100,
      changePct: 0,
      volume: 1000,
      history: [{ date: '2026-01-01', close: 100, volume: 1000 }],
    });
    (ibkrClient.getAccountSummary as jest.Mock).mockResolvedValue({
      availableFunds: 10000, buyingPower: 10000, currency: 'MXN', totalCashValue: 10000, netLiquidation: 10000,
    });
    (ibkrClient.placeOrder as jest.Mock).mockResolvedValue('order-123');
  });

  it('sells without calling Claude when bypass is enabled and P&L is at/above take-profit', async () => {
    (ibkrClient.getPositions as jest.Mock).mockResolvedValue([
      { conid: 111, ticker: 'AMXL', position: 86, avgCost: 98.5, mktValue: 8600, unrealizedPnl: 0 }, // +1.52% at lastPrice 100
    ]);

    const result = await runAgentCycle('AMXL', 'MX', {
      takeProfitPct: 1.5, stopLossPct: 5.0, tpSlBypassEnabled: true,
    });

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(ibkrClient.placeOrder).toHaveBeenCalledWith({ conid: 111, side: 'SELL', quantity: 86, market: 'MX' });
    expect(result.action).toBe('sell');
    expect(result.quantity).toBe(86);
    expect(result.executed).toBe(true);
    expect(result.reason).toContain('Deterministic take-profit bypass');
    expect(prisma.trade.create).toHaveBeenCalledTimes(1);
    expect(prisma.agentLog.create).toHaveBeenCalledTimes(1);
  });

  it('sells without calling Claude when bypass is enabled and P&L is at/below stop-loss', async () => {
    (ibkrClient.getPositions as jest.Mock).mockResolvedValue([
      { conid: 111, ticker: 'AMXL', position: 86, avgCost: 106, mktValue: 8600, unrealizedPnl: 0 }, // -5.66% at lastPrice 100
    ]);

    const result = await runAgentCycle('AMXL', 'MX', {
      takeProfitPct: 1.5, stopLossPct: 5.0, tpSlBypassEnabled: true,
    });

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(result.action).toBe('sell');
    expect(result.reason).toContain('Deterministic stop-loss bypass');
  });

  it('still calls Claude when bypass is enabled but P&L is within normal range', async () => {
    (ibkrClient.getPositions as jest.Mock).mockResolvedValue([
      { conid: 111, ticker: 'AMXL', position: 86, avgCost: 99.5, mktValue: 8600, unrealizedPnl: 0 }, // +0.5%, no trigger
    ]);
    mockAnthropicCreate.mockResolvedValue(claudeHoldResponse('no edge', 0.4));

    const result = await runAgentCycle('AMXL', 'MX', {
      takeProfitPct: 1.5, stopLossPct: 5.0, tpSlBypassEnabled: true,
    });

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    expect(ibkrClient.placeOrder).not.toHaveBeenCalled();
    expect(result.action).toBe('hold');
  });

  it('calls Claude even when TP/SL is breached if the bypass flag is off', async () => {
    (ibkrClient.getPositions as jest.Mock).mockResolvedValue([
      { conid: 111, ticker: 'AMXL', position: 86, avgCost: 98.5, mktValue: 8600, unrealizedPnl: 0 }, // would trigger take-profit
    ]);
    mockAnthropicCreate.mockResolvedValue(claudeHoldResponse('riding the trend', 0.7));

    const result = await runAgentCycle('AMXL', 'MX', {
      takeProfitPct: 1.5, stopLossPct: 5.0, tpSlBypassEnabled: false,
    });

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    expect(ibkrClient.placeOrder).not.toHaveBeenCalled();
    expect(result.action).toBe('hold');
  });

  it('calls Claude when bypass is enabled but there is no open position', async () => {
    (ibkrClient.getPositions as jest.Mock).mockResolvedValue([]);
    mockAnthropicCreate.mockResolvedValue(claudeHoldResponse('no position', 0.5));

    const result = await runAgentCycle('AMXL', 'MX', {
      takeProfitPct: 1.5, stopLossPct: 5.0, tpSlBypassEnabled: true,
    });

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    expect(result.action).toBe('hold');
  });
});
