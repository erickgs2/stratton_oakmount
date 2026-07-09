// Tests the deterministic TP/SL bypass path in runCryptoAgentCycle
// (crypto-agent.ts) — the crypto counterpart to claude-agent-tp-sl-bypass.test.ts.

const mockAnthropicCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  }));
});

jest.mock('@/lib/bitso', () => ({
  bitsoClient: {
    getBalances: jest.fn(),
    getFees: jest.fn(),
    placeOrder: jest.fn(),
  },
}));

jest.mock('@/lib/bitso-market-data', () => ({
  getCryptoMarketData: jest.fn(),
  recordCryptoPriceSnapshot: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    agentLog: { create: jest.fn() },
    trade: { create: jest.fn(), findMany: jest.fn() },
  },
}));

jest.mock('@/lib/bot-logger', () => ({
  writeBotLog: jest.fn(),
}));

import { runCryptoAgentCycle } from '@/lib/crypto-agent';
import { bitsoClient } from '@/lib/bitso';
import { getCryptoMarketData } from '@/lib/bitso-market-data';
import { prisma } from '@/lib/prisma';

const mockIndicators = { changePctSinceSnapshot: null, minutesSinceSnapshot: null, orderBookImbalance: 0, spreadPct: 0.1 };

function claudeHoldResponse(reason: string, confidence = 0.5) {
  return { content: [{ type: 'text', text: JSON.stringify({ action: 'hold', quantity: 0, confidence, reason }) }] };
}

// One buy lot fully matching the current position gives a known, exact avg cost.
function mockSingleBuyLot(quantity: number, price: number) {
  (prisma.trade.findMany as jest.Mock).mockResolvedValue([
    { action: 'buy', quantity, price, createdAt: new Date('2026-01-01T00:00:00Z') },
  ]);
}

describe('runCryptoAgentCycle — deterministic TP/SL bypass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCryptoMarketData as jest.Mock).mockResolvedValue({
      lastPrice: 1000000,
      changePct24h: 0,
      volume24h: 1,
      high24h: 1010000,
      low24h: 990000,
      indicators: mockIndicators,
    });
    (bitsoClient.getFees as jest.Mock).mockResolvedValue([{ book: 'btc_mxn', takerFeeDecimal: 0.005, makerFeeDecimal: 0.005 }]);
    (bitsoClient.placeOrder as jest.Mock).mockResolvedValue('bitso-order-1');
  });

  it('sells without calling Claude when bypass is enabled and P&L is at/above take-profit', async () => {
    (bitsoClient.getBalances as jest.Mock).mockResolvedValue([
      { currency: 'btc', available: 0.1, locked: 0, total: 0.1 },
      { currency: 'mxn', available: 5000, locked: 0, total: 5000 },
    ]);
    mockSingleBuyLot(0.1, 985000); // +1.52% at lastPrice 1,000,000

    const result = await runCryptoAgentCycle('btc_mxn', {
      takeProfitPct: 1.5, stopLossPct: 5.0, tpSlBypassEnabled: true,
    });

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(bitsoClient.placeOrder).toHaveBeenCalledWith({ book: 'btc_mxn', side: 'sell', major: (0.1).toFixed(8) });
    expect(result.action).toBe('sell');
    expect(result.quantity).toBe(0.1);
    expect(result.executed).toBe(true);
    expect(result.reason).toContain('Deterministic take-profit bypass');
    expect(prisma.trade.create).toHaveBeenCalledTimes(1);
    expect(prisma.agentLog.create).toHaveBeenCalledTimes(1);
  });

  it('sells without calling Claude when bypass is enabled and P&L is at/below stop-loss', async () => {
    (bitsoClient.getBalances as jest.Mock).mockResolvedValue([
      { currency: 'btc', available: 0.1, locked: 0, total: 0.1 },
      { currency: 'mxn', available: 5000, locked: 0, total: 5000 },
    ]);
    mockSingleBuyLot(0.1, 1060000); // -5.66% at lastPrice 1,000,000

    const result = await runCryptoAgentCycle('btc_mxn', {
      takeProfitPct: 1.5, stopLossPct: 5.0, tpSlBypassEnabled: true,
    });

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(result.action).toBe('sell');
    expect(result.reason).toContain('Deterministic stop-loss bypass');
  });

  it('still calls Claude when bypass is enabled but P&L is within normal range', async () => {
    (bitsoClient.getBalances as jest.Mock).mockResolvedValue([
      { currency: 'btc', available: 0.1, locked: 0, total: 0.1 },
      { currency: 'mxn', available: 5000, locked: 0, total: 5000 },
    ]);
    mockSingleBuyLot(0.1, 995000); // +0.5%, no trigger
    mockAnthropicCreate.mockResolvedValue(claudeHoldResponse('no edge', 0.4));

    const result = await runCryptoAgentCycle('btc_mxn', {
      takeProfitPct: 1.5, stopLossPct: 5.0, tpSlBypassEnabled: true,
    });

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    expect(bitsoClient.placeOrder).not.toHaveBeenCalled();
    expect(result.action).toBe('hold');
  });

  it('calls Claude even when TP/SL is breached if the bypass flag is off', async () => {
    (bitsoClient.getBalances as jest.Mock).mockResolvedValue([
      { currency: 'btc', available: 0.1, locked: 0, total: 0.1 },
      { currency: 'mxn', available: 5000, locked: 0, total: 5000 },
    ]);
    mockSingleBuyLot(0.1, 985000); // would trigger take-profit
    mockAnthropicCreate.mockResolvedValue(claudeHoldResponse('riding the trend', 0.7));

    const result = await runCryptoAgentCycle('btc_mxn', {
      takeProfitPct: 1.5, stopLossPct: 5.0, tpSlBypassEnabled: false,
    });

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    expect(bitsoClient.placeOrder).not.toHaveBeenCalled();
    expect(result.action).toBe('hold');
  });

  it('calls Claude when bypass is enabled but there is no open position', async () => {
    (bitsoClient.getBalances as jest.Mock).mockResolvedValue([
      { currency: 'btc', available: 0, locked: 0, total: 0 },
      { currency: 'mxn', available: 5000, locked: 0, total: 5000 },
    ]);
    (prisma.trade.findMany as jest.Mock).mockResolvedValue([]);
    mockAnthropicCreate.mockResolvedValue(claudeHoldResponse('no position', 0.5));

    const result = await runCryptoAgentCycle('btc_mxn', {
      takeProfitPct: 1.5, stopLossPct: 5.0, tpSlBypassEnabled: true,
    });

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    expect(result.action).toBe('hold');
  });
});
