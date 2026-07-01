jest.mock('@/lib/ibkr', () => ({
  ibkrClient: {
    searchConid: jest.fn(),
    getMarketDataSnapshot: jest.fn(),
    getMarketDataHistory: jest.fn(),
  },
}));

import { ibkrClient } from '@/lib/ibkr';
import { getUSAMarketData } from '@/lib/ibkr-market-data';

describe('getUSAMarketData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the correctly-shaped MXMarketData object', async () => {
    (ibkrClient.searchConid as jest.Mock).mockResolvedValue(265598);
    (ibkrClient.getMarketDataSnapshot as jest.Mock).mockResolvedValue({
      lastPrice: 168.42, changePct: 1.25, volume: 1300,
    });
    (ibkrClient.getMarketDataHistory as jest.Mock).mockResolvedValue([
      { date: '2026-06-30', close: 167.0, volume: 400000 },
    ]);

    const data = await getUSAMarketData('AAPL');

    expect(data).toEqual({
      symbol: 'AAPL',
      lastPrice: 168.42,
      changePct: 1.25,
      volume: 1300,
      history: [{ date: '2026-06-30', close: 167.0, volume: 400000 }],
    });
  });

  it('throws a clear error when the symbol cannot be resolved to a conid', async () => {
    (ibkrClient.searchConid as jest.Mock).mockResolvedValue(null);

    await expect(getUSAMarketData('BADSYM')).rejects.toThrow('No conid found for symbol BADSYM');
  });

  it('throws a clear error when the snapshot never completes', async () => {
    (ibkrClient.searchConid as jest.Mock).mockResolvedValue(265598);
    (ibkrClient.getMarketDataSnapshot as jest.Mock).mockResolvedValue(null);
    (ibkrClient.getMarketDataHistory as jest.Mock).mockResolvedValue([]);

    await expect(getUSAMarketData('AAPL')).rejects.toThrow('No quote data returned for symbol AAPL');
  });

  it('caches the conid — a second call for the same symbol does not call searchConid again', async () => {
    // Uses a symbol not touched by earlier tests in this file: conidCache is real,
    // unmocked module-level state that persists across tests (jest.clearAllMocks()
    // resets mock call history but not the cache Map itself), so reusing 'AAPL'
    // here would already be pre-cached from the first test and make this assertion
    // order-dependent instead of actually exercising the caching behavior.
    (ibkrClient.searchConid as jest.Mock).mockResolvedValue(272093);
    (ibkrClient.getMarketDataSnapshot as jest.Mock).mockResolvedValue({
      lastPrice: 168.42, changePct: 1.25, volume: 1300,
    });
    (ibkrClient.getMarketDataHistory as jest.Mock).mockResolvedValue([]);

    await getUSAMarketData('MSFT');
    await getUSAMarketData('MSFT');

    expect(ibkrClient.searchConid).toHaveBeenCalledTimes(1);
  });
});
