import https from 'https';
import crypto from 'crypto';

export interface BitsoTicker {
  book: string;
  last: number;
  bid: number;
  ask: number;
  high: number;
  low: number;
  volume: number;
  change24: number;
  createdAt: string;
}

export interface BitsoOrderBookEntry {
  price: number;
  amount: number;
}

export interface BitsoOrderBook {
  asks: BitsoOrderBookEntry[];
  bids: BitsoOrderBookEntry[];
  updatedAt: string;
}

export interface BitsoBalance {
  currency: string;
  available: number;
  locked: number;
  total: number;
}

export interface BitsoBookFee {
  book: string;
  takerFeeDecimal: number;
  makerFeeDecimal: number;
}

export interface PlaceBitsoOrderParams {
  book: string;
  side: 'buy' | 'sell';
  major: string; // amount in the base crypto currency, as a decimal string, e.g. "0.001"
}

// Bitso's documented examples are inconsistent about whether every endpoint
// wraps its response in {success, payload} — the order-book/orders docs show
// the wrapper, the ticker doc excerpt does not. Handle both shapes rather
// than assuming one; verify against a live sandbox call before trusting this
// in production.
function unwrapEnvelope<T>(parsed: unknown): T {
  if (parsed && typeof parsed === 'object' && 'success' in (parsed as Record<string, unknown>)) {
    const envelope = parsed as { success: boolean; payload?: T; error?: { message: string } };
    if (envelope.success === false) {
      throw new Error(`Bitso API error: ${envelope.error?.message ?? JSON.stringify(parsed)}`);
    }
    return envelope.payload as T;
  }
  return parsed as T;
}

export class BitsoClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly hostname: string;
  private lastNonce = 0;

  constructor() {
    this.apiKey = process.env.BITSO_API_KEY ?? '';
    this.apiSecret = process.env.BITSO_API_SECRET ?? '';
    this.hostname = process.env.BITSO_API_HOSTNAME ?? 'api.bitso.com';
  }

  // Must be strictly increasing per Bitso's auth spec. Date.now() alone risks
  // two calls in the same millisecond (e.g. concurrent authenticated requests)
  // reusing a value — guard with a monotonic floor against the last nonce issued.
  private nextNonce(): number {
    const n = Math.max(Date.now(), this.lastNonce + 1);
    this.lastNonce = n;
    return n;
  }

  private request<T>(method: string, path: string, body?: unknown, authenticated = false): Promise<T> {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'stratton-oakmont/1.0',
      };

      if (authenticated) {
        const nonce = this.nextNonce().toString();
        const message = nonce + method + path + bodyStr;
        const signature = crypto.createHmac('sha256', this.apiSecret).update(message).digest('hex');
        headers['Authorization'] = `Bitso ${this.apiKey}:${nonce}:${signature}`;
      }

      const req = https.request(
        {
          hostname: this.hostname,
          port: 443,
          path,
          method,
          headers: {
            ...headers,
            ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
          },
        },
        res => {
          let data = '';
          res.on('data', (chunk: string) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(unwrapEnvelope<T>(JSON.parse(data)));
              } catch (err) {
                reject(err);
              }
            } else {
              reject(new Error(`Bitso API error ${res.statusCode}: ${data}`));
            }
          });
        }
      );

      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  async getTicker(book: string): Promise<BitsoTicker> {
    type RawTicker = {
      book: string; last: string; bid: string; ask: string;
      high: string; low: string; volume: string; change_24: string; created_at: string;
    };
    const raw = await this.request<RawTicker>('GET', `/v3/ticker/?book=${book}`);
    return {
      book: raw.book,
      last: parseFloat(raw.last),
      bid: parseFloat(raw.bid),
      ask: parseFloat(raw.ask),
      high: parseFloat(raw.high),
      low: parseFloat(raw.low),
      volume: parseFloat(raw.volume),
      change24: parseFloat(raw.change_24),
      createdAt: raw.created_at,
    };
  }

  async getOrderBook(book: string): Promise<BitsoOrderBook> {
    type RawEntry = { book: string; price: string; amount: string };
    type RawBook = { asks: RawEntry[]; bids: RawEntry[]; updated_at: string };
    const raw = await this.request<RawBook>('GET', `/v3/order_book/?book=${book}`);
    return {
      asks: raw.asks.map(a => ({ price: parseFloat(a.price), amount: parseFloat(a.amount) })),
      bids: raw.bids.map(b => ({ price: parseFloat(b.price), amount: parseFloat(b.amount) })),
      updatedAt: raw.updated_at,
    };
  }

  async getBalances(): Promise<BitsoBalance[]> {
    type RawBalance = { currency: string; available: string; locked: string; total: string };
    const raw = await this.request<{ balances: RawBalance[] }>('GET', '/v3/balance/', undefined, true);
    return raw.balances.map(b => ({
      currency: b.currency,
      available: parseFloat(b.available),
      locked: parseFloat(b.locked),
      total: parseFloat(b.total),
    }));
  }

  async getFees(): Promise<BitsoBookFee[]> {
    type RawFee = { book: string; taker_fee_decimal: string; maker_fee_decimal: string };
    const raw = await this.request<{ fees: RawFee[] }>('GET', '/v3/fees/', undefined, true);
    return raw.fees.map(f => ({
      book: f.book,
      takerFeeDecimal: parseFloat(f.taker_fee_decimal),
      makerFeeDecimal: parseFloat(f.maker_fee_decimal),
    }));
  }

  async placeOrder(params: PlaceBitsoOrderParams): Promise<string> {
    const result = await this.request<{ oid: string }>(
      'POST',
      '/v3/orders/',
      { book: params.book, side: params.side, type: 'market', major: params.major },
      true,
    );
    return result.oid;
  }
}

export const bitsoClient = new BitsoClient();
