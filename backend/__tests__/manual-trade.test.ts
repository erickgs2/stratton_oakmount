jest.mock('@/lib/prisma', () => ({
  prisma: { trade: { create: jest.fn() } },
}));
jest.mock('@/lib/ibkr', () => ({
  ibkrClient: {
    getPositions: jest.fn(),
    getAccountSummary: jest.fn(),
    searchConid: jest.fn(),
    placeOrder: jest.fn(),
  },
}));
jest.mock('@/lib/bitso', () => ({
  bitsoClient: {
    getTicker: jest.fn(),
    getBalances: jest.fn(),
    placeOrder: jest.fn(),
  },
}));
jest.mock('@/lib/databursatil', () => ({ getMXMarketData: jest.fn() }));
jest.mock('@/lib/ibkr-market-data', () => ({ getUSAMarketData: jest.fn() }));
jest.mock('@/lib/market-hours', () => ({ isMarketOpen: jest.fn() }));

import { prisma } from '@/lib/prisma';
import { ibkrClient } from '@/lib/ibkr';
import { bitsoClient } from '@/lib/bitso';
import { getMXMarketData } from '@/lib/databursatil';
import { getUSAMarketData } from '@/lib/ibkr-market-data';
import { isMarketOpen } from '@/lib/market-hours';
import { executeManualTrade } from '@/lib/manual-trade';

beforeEach(() => jest.clearAllMocks());

describe('executeManualTrade — MX/USA stock path', () => {
  it('rejects when the market is closed', async () => {
    (isMarketOpen as jest.Mock).mockReturnValue(false);
    const result = await executeManualTrade({
      market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 10, placedByEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/closed/i);
    expect(result.errorType).toBe('validation');
  });

  it('rejects a non-positive quantity', async () => {
    (isMarketOpen as jest.Mock).mockReturnValue(true);
    const result = await executeManualTrade({
      market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 0, placedByEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.errorType).toBe('validation');
  });

  it('rejects a sell that exceeds the held position', async () => {
    (isMarketOpen as jest.Mock).mockReturnValue(true);
    (ibkrClient.getPositions as jest.Mock).mockResolvedValue([
      { conid: 1, ticker: 'AMXL', position: 5, avgCost: 10, mktValue: 50, unrealizedPnl: 0 },
    ]);
    const result = await executeManualTrade({
      market: 'MX', symbol: 'AMXL', side: 'sell', quantity: 10, placedByEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/only 5 held/);
  });

  it('rejects a buy that exceeds available funds', async () => {
    (isMarketOpen as jest.Mock).mockReturnValue(true);
    (ibkrClient.getPositions as jest.Mock).mockResolvedValue([]);
    (ibkrClient.searchConid as jest.Mock).mockResolvedValue(999);
    (getMXMarketData as jest.Mock).mockResolvedValue({ symbol: 'AMXL', lastPrice: 20, changePct: 0, volume: 0, history: [] });
    (ibkrClient.getAccountSummary as jest.Mock).mockResolvedValue({
      availableFunds: 100, buyingPower: 100, currency: 'MXN', totalCashValue: 100, netLiquidation: 100,
    });
    const result = await executeManualTrade({
      market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 10, placedByEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/insufficient funds/i);
    expect(ibkrClient.placeOrder).not.toHaveBeenCalled();
  });

  it('rejects when no conid can be resolved', async () => {
    (isMarketOpen as jest.Mock).mockReturnValue(true);
    (ibkrClient.getPositions as jest.Mock).mockResolvedValue([]);
    (ibkrClient.searchConid as jest.Mock).mockResolvedValue(null);
    const result = await executeManualTrade({
      market: 'USA', symbol: 'AAPL', side: 'buy', quantity: 1, placedByEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/tradeable contract/);
  });

  it('reports a broker rejection distinctly from a validation error', async () => {
    (isMarketOpen as jest.Mock).mockReturnValue(true);
    (ibkrClient.getPositions as jest.Mock).mockResolvedValue([
      { conid: 1, ticker: 'AAPL', position: 5, avgCost: 100, mktValue: 500, unrealizedPnl: 0 },
    ]);
    (getUSAMarketData as jest.Mock).mockResolvedValue({ symbol: 'AAPL', lastPrice: 100, changePct: 0, volume: 0, history: [] });
    (ibkrClient.placeOrder as jest.Mock).mockResolvedValue('');
    const result = await executeManualTrade({
      market: 'USA', symbol: 'AAPL', side: 'sell', quantity: 2, placedByEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.errorType).toBe('broker_rejected');
    expect(prisma.trade.create).not.toHaveBeenCalled();
  });

  it('places a buy order and records the trade on success', async () => {
    (isMarketOpen as jest.Mock).mockReturnValue(true);
    (ibkrClient.getPositions as jest.Mock).mockResolvedValue([]);
    (ibkrClient.searchConid as jest.Mock).mockResolvedValue(999);
    (getMXMarketData as jest.Mock).mockResolvedValue({ symbol: 'AMXL', lastPrice: 20, changePct: 0, volume: 0, history: [] });
    (ibkrClient.getAccountSummary as jest.Mock).mockResolvedValue({
      availableFunds: 10000, buyingPower: 10000, currency: 'MXN', totalCashValue: 10000, netLiquidation: 10000,
    });
    (ibkrClient.placeOrder as jest.Mock).mockResolvedValue('ord-1');
    (prisma.trade.create as jest.Mock).mockResolvedValue({ id: 't1', quantity: 10, price: 20 });

    const result = await executeManualTrade({
      market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 10, placedByEmail: 'a@b.com',
    });

    expect(result.success).toBe(true);
    expect(result.trade).toEqual({ id: 't1', quantity: 10, price: 20 });
    expect(ibkrClient.placeOrder).toHaveBeenCalledWith({ conid: 999, side: 'BUY', quantity: 10, market: 'MX' });
    expect(prisma.trade.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        symbol: 'AMXL', market: 'MX', action: 'buy', quantity: 10, price: 20,
        currency: 'MXN', ibkrOrderId: 'ord-1', source: 'manual', placedByEmail: 'a@b.com',
      }),
    });
  });
});

describe('executeManualTrade — CRYPTO path', () => {
  it('rejects a non-positive MXN amount', async () => {
    const result = await executeManualTrade({
      market: 'CRYPTO', symbol: 'btc_mxn', side: 'buy', mxnAmount: 0, placedByEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.errorType).toBe('validation');
  });

  it('rejects a buy that exceeds available MXN balance', async () => {
    (bitsoClient.getTicker as jest.Mock).mockResolvedValue({
      book: 'btc_mxn', last: 1000000, bid: 0, ask: 0, high: 0, low: 0, volume: 0, change24: 0, createdAt: '',
    });
    (bitsoClient.getBalances as jest.Mock).mockResolvedValue([
      { currency: 'mxn', available: 500, locked: 0, total: 500 },
    ]);
    const result = await executeManualTrade({
      market: 'CRYPTO', symbol: 'btc_mxn', side: 'buy', mxnAmount: 1000, placedByEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/insufficient mxn/i);
    expect(bitsoClient.placeOrder).not.toHaveBeenCalled();
  });

  it('rejects a sell that exceeds held coin balance', async () => {
    (bitsoClient.getTicker as jest.Mock).mockResolvedValue({
      book: 'btc_mxn', last: 1000000, bid: 0, ask: 0, high: 0, low: 0, volume: 0, change24: 0, createdAt: '',
    });
    (bitsoClient.getBalances as jest.Mock).mockResolvedValue([
      { currency: 'btc', available: 0.0001, locked: 0, total: 0.0001 },
    ]);
    const result = await executeManualTrade({
      market: 'CRYPTO', symbol: 'btc_mxn', side: 'sell', mxnAmount: 1000000, placedByEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/insufficient btc/i);
  });

  it('places a buy order, converting MXN amount to coin quantity', async () => {
    (bitsoClient.getTicker as jest.Mock).mockResolvedValue({
      book: 'btc_mxn', last: 1000000, bid: 0, ask: 0, high: 0, low: 0, volume: 0, change24: 0, createdAt: '',
    });
    (bitsoClient.getBalances as jest.Mock).mockResolvedValue([
      { currency: 'mxn', available: 5000, locked: 0, total: 5000 },
    ]);
    (bitsoClient.placeOrder as jest.Mock).mockResolvedValue('oid-1');
    (prisma.trade.create as jest.Mock).mockResolvedValue({ id: 't2', quantity: 0.001, price: 1000000 });

    const result = await executeManualTrade({
      market: 'CRYPTO', symbol: 'btc_mxn', side: 'buy', mxnAmount: 1000, placedByEmail: 'a@b.com',
    });

    expect(result.success).toBe(true);
    expect(bitsoClient.placeOrder).toHaveBeenCalledWith({ book: 'btc_mxn', side: 'buy', major: '0.00100000' });
    expect(prisma.trade.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        symbol: 'btc_mxn', market: 'CRYPTO', action: 'buy', currency: 'MXN',
        source: 'manual', placedByEmail: 'a@b.com', ibkrOrderId: 'oid-1',
      }),
    });
  });
});
