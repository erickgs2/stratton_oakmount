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

  describe('getBalances', () => {
    it('signs the request with an HMAC Authorization header and parses balances', async () => {
      mockHttpsResponse(200, {
        success: true,
        payload: { balances: [{ currency: 'mxn', available: '5000.00', locked: '0', total: '5000.00' }] },
      });

      const balances = await client.getBalances();

      expect(balances[0]).toEqual({ currency: 'mxn', available: 5000, locked: 0, total: 5000 });
      const opts = (https.request as jest.Mock).mock.calls[0][0];
      expect(opts.headers.Authorization).toMatch(/^Bitso test-key:\d+:[0-9a-f]{64}$/);
      expect(opts.path).toBe('/v3/balance/');
    });
  });

  describe('getFees', () => {
    it('parses taker/maker fee decimals per book', async () => {
      mockHttpsResponse(200, {
        success: true,
        payload: { fees: [{ book: 'btc_mxn', taker_fee_decimal: '0.0025', maker_fee_decimal: '0.0020' }] },
      });

      const fees = await client.getFees();

      expect(fees[0]).toEqual({ book: 'btc_mxn', takerFeeDecimal: 0.0025, makerFeeDecimal: 0.002 });
    });
  });

  describe('placeOrder', () => {
    it('sends type "market" with the given book/side/major and returns the order id', async () => {
      const mockReq = mockHttpsResponse(200, { success: true, payload: { oid: 'ABC123' } });

      const oid = await client.placeOrder({ book: 'eth_mxn', side: 'sell', major: '0.25' });

      expect(oid).toBe('ABC123');
      const sentBody = JSON.parse(mockReq.write.mock.calls[0][0] as string);
      expect(sentBody).toEqual({ book: 'eth_mxn', side: 'sell', type: 'market', major: '0.25' });
      const opts = (https.request as jest.Mock).mock.calls[0][0];
      expect(opts.method).toBe('POST');
      expect(opts.path).toBe('/v3/orders/');
    });

    it('rejects when Bitso returns success: false', async () => {
      mockHttpsResponse(200, { success: false, error: { code: '0201', message: 'Invalid amount' } });

      await expect(client.placeOrder({ book: 'btc_mxn', side: 'buy', major: '0' }))
        .rejects.toThrow('Invalid amount');
    });
  });
});
