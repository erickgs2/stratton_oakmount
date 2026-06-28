import https from 'https';
import { IBKRClient } from '@/lib/ibkr';

// Mock the https module so no real network calls are made
jest.mock('https', () => ({
  Agent: jest.fn().mockImplementation(() => ({})),
  request: jest.fn(),
}));

function mockHttpsResponse(statusCode: number, body: unknown) {
  const mockResponse = {
    statusCode,
    on: jest.fn((event: string, cb: (data?: string) => void) => {
      if (event === 'data') cb(JSON.stringify(body));
      if (event === 'end') cb();
    }),
  };
  const mockRequest = {
    on: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  };
  (https.request as jest.Mock).mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
    callback(mockResponse);
    return mockRequest;
  });
  return mockRequest;
}

describe('IBKRClient', () => {
  let client: IBKRClient;

  beforeEach(() => {
    process.env.IBKR_GATEWAY_URL = 'https://localhost:5000/v1/api';
    process.env.IBKR_ACCOUNT_ID = 'TEST123';
    client = new IBKRClient();
    jest.clearAllMocks();
  });

  describe('getPositions', () => {
    it('returns an array of positions', async () => {
      const mockPositions = [
        { conid: 265598, ticker: 'AMXL', position: 100, avgCost: 12.0, mktValue: 1250, unrealizedPnl: 50 },
      ];
      mockHttpsResponse(200, mockPositions);

      const positions = await client.getPositions();

      expect(Array.isArray(positions)).toBe(true);
      expect(positions[0].ticker).toBe('AMXL');
    });
  });

  describe('getAccountSummary', () => {
    it('returns mapped account summary', async () => {
      const mockSummary = {
        availablefunds: { amount: 50000, currency: 'MXN' },
        buyingpower: { amount: 100000, currency: 'MXN' },
        totalcashvalue: { amount: 50000, currency: 'MXN' },
        netliquidation: { amount: 65000, currency: 'MXN' },
      };
      mockHttpsResponse(200, mockSummary);

      const summary = await client.getAccountSummary();

      expect(summary.availableFunds).toBe(50000);
      expect(summary.currency).toBe('MXN');
    });
  });

  describe('placeOrder', () => {
    it('returns the orderId for MX market order', async () => {
      mockHttpsResponse(200, [{ orderId: 'ORDER-001' }]);

      const orderId = await client.placeOrder({
        conid: 265598,
        side: 'BUY',
        quantity: 100,
        market: 'MX',
      });

      expect(orderId).toBe('ORDER-001');
    });

    it('returns the orderId for USA market order', async () => {
      mockHttpsResponse(200, [{ orderId: 'ORDER-002' }]);

      const orderId = await client.placeOrder({
        conid: 4815,
        side: 'SELL',
        quantity: 10,
        market: 'USA',
      });

      expect(orderId).toBe('ORDER-002');
    });
  });

  describe('keep-alive', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('calls /tickle every 55 seconds when keepAlive is started', () => {
      mockHttpsResponse(200, { session: '123' });

      client.startKeepAlive();
      jest.advanceTimersByTime(110_000); // advance 110s = 2 calls

      expect(https.request).toHaveBeenCalledTimes(2);
      client.stopKeepAlive();
    });

    it('stops calling /tickle after stopKeepAlive', () => {
      mockHttpsResponse(200, { session: '123' });

      client.startKeepAlive();
      jest.advanceTimersByTime(55_000);
      client.stopKeepAlive();
      jest.advanceTimersByTime(110_000); // no more calls

      expect(https.request).toHaveBeenCalledTimes(1);
    });
  });
});
