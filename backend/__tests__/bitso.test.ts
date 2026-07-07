import https from 'https';
import { BitsoClient } from '@/lib/bitso';

// Mock the https module so no real network calls are made
jest.mock('https', () => ({
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

describe('BitsoClient', () => {
  let client: BitsoClient;

  beforeEach(() => {
    process.env.BITSO_API_KEY = 'test-key';
    process.env.BITSO_API_SECRET = 'test-secret';
    process.env.BITSO_API_HOSTNAME = 'api.bitso.com';
    client = new BitsoClient();
    jest.clearAllMocks();
  });

  describe('getTicker', () => {
    it('parses numeric string fields into numbers', async () => {
      mockHttpsResponse(200, {
        book: 'btc_mxn', last: '1000000.00', bid: '999000.00', ask: '1001000.00',
        high: '1050000.00', low: '950000.00', volume: '12.5', change_24: '5000.00',
        created_at: '2026-07-07T00:00:00+00:00',
      });

      const ticker = await client.getTicker('btc_mxn');

      expect(ticker.last).toBe(1000000);
      expect(ticker.bid).toBe(999000);
      expect(ticker.ask).toBe(1001000);
      expect(ticker.change24).toBe(5000);
      expect(ticker.volume).toBe(12.5);
    });

    it('sends the book as a query param on an unauthenticated GET', async () => {
      mockHttpsResponse(200, {
        book: 'btc_mxn', last: '1', bid: '1', ask: '1', high: '1', low: '1',
        volume: '1', change_24: '0', created_at: '2026-07-07T00:00:00+00:00',
      });

      await client.getTicker('btc_mxn');

      const opts = (https.request as jest.Mock).mock.calls[0][0];
      expect(opts.path).toBe('/v3/ticker/?book=btc_mxn');
      expect(opts.method).toBe('GET');
      expect(opts.headers.Authorization).toBeUndefined();
    });
  });

  describe('getOrderBook', () => {
    it('parses bids and asks into numeric price/amount pairs, unwrapping the payload envelope', async () => {
      mockHttpsResponse(200, {
        success: true,
        payload: {
          asks: [{ book: 'btc_mxn', price: '1001000.00', amount: '0.5' }],
          bids: [{ book: 'btc_mxn', price: '999000.00', amount: '0.8' }],
          updated_at: '2026-07-07T00:00:00+00:00',
        },
      });

      const book = await client.getOrderBook('btc_mxn');

      expect(book.asks[0]).toEqual({ price: 1001000, amount: 0.5 });
      expect(book.bids[0]).toEqual({ price: 999000, amount: 0.8 });
      expect(book.updatedAt).toBe('2026-07-07T00:00:00+00:00');
    });
  });
});
