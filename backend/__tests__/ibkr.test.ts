import https from 'https';
import { IBKRClient } from '@/lib/ibkr';

// Mock the https module so no real network calls are made
jest.mock('https', () => ({
  Agent: jest.fn().mockImplementation(() => ({})),
  request: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    appSettings: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';

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
    (prisma.appSettings.findUnique as jest.Mock).mockResolvedValue(null);
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
      mockHttpsResponse(200, [{ order_id: 12345 }]);

      const orderId = await client.placeOrder({
        conid: 265598,
        side: 'BUY',
        quantity: 100,
        market: 'MX',
      });

      expect(orderId).toBe('12345');
    });

    it('returns the orderId for USA market order', async () => {
      mockHttpsResponse(200, [{ order_id: 12345 }]);

      const orderId = await client.placeOrder({
        conid: 4815,
        side: 'SELL',
        quantity: 10,
        market: 'USA',
      });

      expect(orderId).toBe('12345');
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

  describe('checkAuthStatus', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns true when authenticated and connected', async () => {
      mockHttpsResponse(200, { authenticated: true, connected: true, competing: false });
      const result = await client.checkAuthStatus();
      expect(result).toBe(true);
    });

    it('returns false when not authenticated', async () => {
      mockHttpsResponse(200, { authenticated: false, connected: true });
      const result = await client.checkAuthStatus();
      expect(result).toBe(false);
    });

    it('returns false when connected is false', async () => {
      mockHttpsResponse(200, { authenticated: true, connected: false });
      const result = await client.checkAuthStatus();
      expect(result).toBe(false);
    });

    it('returns false on network error (ECONNREFUSED)', async () => {
      const errorReq = {
        on: jest.fn((event: string, cb: (err: Error) => void) => {
          if (event === 'error') cb(new Error('ECONNREFUSED'));
        }),
        write: jest.fn(),
        end: jest.fn(),
      };
      (https.request as jest.Mock).mockImplementation(() => errorReq);
      const result = await client.checkAuthStatus();
      expect(result).toBe(false);
    });

    it('returns false on non-2xx response', async () => {
      mockHttpsResponse(401, { error: 'Unauthorized' });
      const result = await client.checkAuthStatus();
      expect(result).toBe(false);
    });

    it('returns false when gateway does not respond within 5 seconds', async () => {
      // Request that never resolves
      const hangingReq = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
      (https.request as jest.Mock).mockImplementation(() => hangingReq);

      const promise = client.checkAuthStatus();
      jest.advanceTimersByTime(5_000);
      const result = await promise;
      expect(result).toBe(false);
    });
  });

  describe('resolveAccountId (via getPositions)', () => {
    it('uses the DB-configured account id when a settings row exists', async () => {
      (prisma.appSettings.findUnique as jest.Mock).mockResolvedValue({
        id: 'singleton',
        ibkrAccountId: 'U9999999',
      });
      const mockReq = mockHttpsResponse(200, []);

      await client.getPositions();

      const [opts] = (https.request as jest.Mock).mock.calls[0];
      expect(opts.path).toBe('/v1/api/portfolio/U9999999/positions/0');
      void mockReq;
    });

    it('falls back to the env var when no settings row exists', async () => {
      mockHttpsResponse(200, []);

      await client.getPositions();

      const [opts] = (https.request as jest.Mock).mock.calls[0];
      expect(opts.path).toBe('/v1/api/portfolio/TEST123/positions/0');
    });

    it('only queries Prisma once across multiple calls (cached)', async () => {
      mockHttpsResponse(200, []);

      await client.getPositions();
      await client.getPositions();

      expect(prisma.appSettings.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('setAccountId', () => {
    it('updates the cached account id without another Prisma call', async () => {
      mockHttpsResponse(200, []);
      await client.getPositions(); // primes the cache from the env fallback

      client.setAccountId('U8888888');
      await client.getPositions();

      const [opts] = (https.request as jest.Mock).mock.calls[1];
      expect(opts.path).toBe('/v1/api/portfolio/U8888888/positions/0');
      expect(prisma.appSettings.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('logout', () => {
    it('issues a POST to /logout', async () => {
      mockHttpsResponse(200, { status: 'success' });

      await client.logout();

      const [opts] = (https.request as jest.Mock).mock.calls[0];
      expect(opts.path).toBe('/v1/api/logout');
      expect(opts.method).toBe('POST');
    });
  });
});
