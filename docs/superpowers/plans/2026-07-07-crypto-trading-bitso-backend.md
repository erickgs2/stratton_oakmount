# Crypto Trading via Bitso — Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Bitso-powered cryptocurrency trading as a third market (`CRYPTO`) alongside the existing `MX`/`USA` stock markets — backend only (data, decisioning, execution). Zero behavioral change to MX/USA.

**Architecture:** A new, self-contained `crypto-agent.ts` orchestration module (mirrors `claude-agent.ts`'s shape: system prompt, user-prompt builder, request-context builder, preview, run-cycle) built on a new `BitsoClient` (mirrors `IBKRClient`'s HMAC-signed raw-`https` request pattern) and a new `crypto-indicators.ts` (mirrors `indicators.ts`'s pure-function style). Because Bitso has no OHLC/candle endpoint, "momentum" for crypto comes from a new `CryptoPriceSnapshot` table (one row recorded per cycle) instead of the daily-bar history MX/USA use. `claude-agent.ts`'s two **exported** functions (`previewAgentRequest`, `runAgentCycle`) each gain one guard-clause line at the very top that delegates to the crypto module when `market === 'CRYPTO'`, before any existing code runs — every existing MX/USA line in that file is left byte-for-byte untouched.

**Tech Stack:** Next.js API routes, Prisma/Postgres, Node's built-in `https` module (no HTTP client library — matches `ibkr.ts`), Jest, Anthropic SDK (`claude-sonnet-4-6`, reused from `claude-agent.ts`).

## Global Constraints

- Existing MX/USA trading behavior must not change. The full existing Jest suite must pass unmodified, and `npx tsc --noEmit` must stay clean, after every task (Task 13 is a final full-suite regression pass).
- Do not modify `backend/lib/ibkr.ts`, `backend/lib/databursatil.ts`, `backend/lib/ibkr-market-data.ts`, or `backend/lib/trading-context.ts`. All new crypto logic lives in new files. (`trading-context.ts` in particular is shared/unpartitioned by market today — reusing it for crypto would leak crypto trades into MX/USA's prompt context and vice versa. Crypto gets its own equivalent, built directly on the `Trade` table filtered by `market: 'CRYPTO'`.)
- MVP scope only: market orders only (no limit/stop), no WebSocket data, no second external price-data source beyond Bitso's own ticker/order-book/balance/fee endpoints, no multi-coin correlation, no backtesting, no live-money gating decision (mirrors how MX/USA have no risk gating today either).
- Crypto reuses the existing `BotConfig` numeric fields and their existing MX/USA default values (`confidenceThreshold` 0.65, `takeProfitPct` 1.5, `stopLossPct` 1.0) — no new config columns, no crypto-specific schema changes beyond the one new `CryptoPriceSnapshot` table.
- Currency for all crypto trading is MXN (Bitso is MXN-denominated; the curated symbol list trades only `_mxn` books).
- Follow this codebase's established conventions exactly: raw `https` module for external API calls (not axios/fetch), Jest with manual `https` mocking for client tests (pattern established in `backend/__tests__/ibkr.test.ts`), plain pure-function tests for indicator math (pattern established in `backend/__tests__/indicators.test.ts`), no Jest tests for the orchestration/prompt-building layer — `claude-agent.ts` has none today, so `crypto-agent.ts` follows the same precedent and is instead verified via the existing "preview request" mechanism.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `backend/lib/market.ts` | Create | Single shared `Market` type (`'MX' \| 'USA' \| 'CRYPTO'`), imported everywhere a market discriminator is needed. |
| `backend/prisma/schema.prisma` | Modify | Add `CryptoPriceSnapshot` model. No existing model touched. |
| `backend/lib/bitso.ts` | Create | `BitsoClient` — HMAC-signed REST calls to Bitso (ticker, order book, balances, fees, place order). Mirrors `ibkr.ts`. |
| `backend/lib/crypto-indicators.ts` | Create | Pure functions computing crypto-native indicators (price change since snapshot, order book imbalance, spread) from Bitso data. Mirrors `indicators.ts`. |
| `backend/lib/bitso-market-data.ts` | Create | `getCryptoMarketData(book)` — fetches ticker/order book, records a `CryptoPriceSnapshot`, and returns computed indicators. Mirrors `databursatil.ts`/`ibkr-market-data.ts`'s role. |
| `backend/lib/crypto-agent.ts` | Create | Crypto-specific system prompt, user-prompt builder, request-context builder, `previewCryptoAgentRequest`, `runCryptoAgentCycle`. Mirrors `claude-agent.ts`'s orchestration role for the CRYPTO market only. |
| `backend/lib/market-hours.ts` | Modify | Add `isCryptoOpen()` (always `true`); widen `isMarketOpen`'s exported signature to accept `Market`. `isWeekdayInRange`/`isBMVOpen`/`isNYSEOpen` untouched. |
| `backend/lib/claude-agent.ts` | Modify | Widen `previewAgentRequest`/`runAgentCycle` param types to `Market`; add a one-line CRYPTO guard clause at the top of each. No other line changes. |
| `backend/lib/pnl.ts` | Modify | Widen `Market` type usage; add a `CRYPTO` entry to `MARKET_TIMEZONE` and the currency branch. |
| `backend/app/api/bot/config/route.ts` | Modify | Widen `market` body type to `Market`. |
| `backend/app/api/bot/start/route.ts` | Modify | Widen `market` body type; skip `ibkrClient.startKeepAlive()` for CRYPTO. |
| `backend/app/api/bot/stop/route.ts` | Modify | Widen `market` body type; skip `ibkrClient.stopKeepAlive()` / `resetDailyContext()` for CRYPTO. |
| `backend/app/api/bot/status/route.ts` | Modify | Widen `market` query type; add `CRYPTO: isCryptoOpen()` to the response. |
| `backend/app/api/agent/run/route.ts` | Modify | Widen `market` body type; remove the route's own MX/USA fee fallback ternary (let `runAgentCycle`/`runCryptoAgentCycle` apply the right per-market default internally). |
| `backend/app/api/agent/preview/route.ts` | Modify | Widen the market validation check to also accept `CRYPTO`. |
| `backend/app/api/agent/logs/route.ts` | Modify | Widen the market validation check to also accept `CRYPTO`. |
| `backend/app/api/pnl/route.ts` | Modify | Widen the market validation check to also accept `CRYPTO`. |
| `backend/app/api/trades/route.ts` | Modify | Widen the `market` query param type to `Market`. |
| `backend/__tests__/bitso.test.ts` | Create | Jest tests for `BitsoClient`, mirroring `ibkr.test.ts`'s `https`-mocking convention. |
| `backend/__tests__/crypto-indicators.test.ts` | Create | Jest tests for the pure indicator functions, mirroring `indicators.test.ts`. |
| `backend/__tests__/market-hours.test.ts` | Modify | Add tests for `isCryptoOpen()`. |

---

### Task 1: Shared Market type + CryptoPriceSnapshot model

**Files:**
- Create: `backend/lib/market.ts`
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: `export type Market = 'MX' | 'USA' | 'CRYPTO';` — consumed by every task below. `CryptoPriceSnapshot` Prisma model (`book: string`, `price: number`, `recordedAt: Date`) — consumed by Task 6.

- [ ] **Step 1: Create the shared Market type**

```typescript
// backend/lib/market.ts
export type Market = 'MX' | 'USA' | 'CRYPTO';
```

- [ ] **Step 2: Add the CryptoPriceSnapshot model to the Prisma schema**

Append to `backend/prisma/schema.prisma` (after the existing `AppSettings` model, at the end of the file):

```prisma
model CryptoPriceSnapshot {
  id         String   @id @default(cuid())
  book       String   // Bitso book, e.g. "btc_mxn"
  price      Float
  recordedAt DateTime @default(now())

  @@index([book, recordedAt])
}
```

- [ ] **Step 3: Run the migration**

Run: `cd backend && npx prisma migrate dev --name add_crypto_price_snapshot`
Expected: a new folder under `backend/prisma/migrations/` containing the `CREATE TABLE "CryptoPriceSnapshot"` SQL, and "Your database is now in sync with your schema."

- [ ] **Step 4: Regenerate the Prisma client and verify the build**

Run: `cd backend && npx prisma generate && npx tsc --noEmit`
Expected: both commands exit 0. `prisma.cryptoPriceSnapshot` is now available on the generated client.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/market.ts backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: add shared Market type and CryptoPriceSnapshot model"
```

---

### Task 2: BitsoClient — signing, generic request, getTicker, getOrderBook

**Files:**
- Create: `backend/lib/bitso.ts`
- Test: `backend/__tests__/bitso.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export class BitsoClient` with `getTicker(book: string): Promise<BitsoTicker>` and `getOrderBook(book: string): Promise<BitsoOrderBook>`; `export const bitsoClient: BitsoClient`. `BitsoTicker { book, last, bid, ask, high, low, volume, change24, createdAt }`, `BitsoOrderBook { asks: BitsoOrderBookEntry[], bids: BitsoOrderBookEntry[], updatedAt }`, `BitsoOrderBookEntry { price, amount }` — all consumed by Task 6.
- Requires local env vars `BITSO_API_KEY` / `BITSO_API_SECRET` (used by Task 3's authenticated calls; unauthenticated calls in this task work without them). No `.env.example` exists in this repo (matches `IBKR_ACCOUNT_ID`/`ANTHROPIC_API_KEY` convention) — add real values to your local untracked `.env`/`.env.local` before manual/live testing.

- [ ] **Step 1: Write the failing tests for getTicker and getOrderBook**

```typescript
// backend/__tests__/bitso.test.ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest bitso.test.ts`
Expected: FAIL — `Cannot find module '@/lib/bitso'`.

- [ ] **Step 3: Implement BitsoClient with signing, generic request, getTicker, getOrderBook**

```typescript
// backend/lib/bitso.ts
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

  constructor() {
    this.apiKey = process.env.BITSO_API_KEY ?? '';
    this.apiSecret = process.env.BITSO_API_SECRET ?? '';
    this.hostname = process.env.BITSO_API_HOSTNAME ?? 'api.bitso.com';
  }

  private request<T>(method: string, path: string, body?: unknown, authenticated = false): Promise<T> {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'stratton-oakmont/1.0',
      };

      if (authenticated) {
        const nonce = Date.now().toString();
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
}

export const bitsoClient = new BitsoClient();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest bitso.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/lib/bitso.ts backend/__tests__/bitso.test.ts
git commit -m "feat: add BitsoClient with getTicker and getOrderBook"
```

---

### Task 3: BitsoClient — getBalances, getFees, placeOrder

**Files:**
- Modify: `backend/lib/bitso.ts`
- Test: `backend/__tests__/bitso.test.ts`

**Interfaces:**
- Consumes: `BitsoClient` from Task 2 (extends the same class).
- Produces: `getBalances(): Promise<BitsoBalance[]>`, `getFees(): Promise<BitsoBookFee[]>`, `placeOrder(params: PlaceBitsoOrderParams): Promise<string>` (returns the Bitso order id) — all consumed by Task 8/9.

- [ ] **Step 1: Write the failing tests**

Append to `backend/__tests__/bitso.test.ts`, inside the existing `describe('BitsoClient', ...)` block, after the `getOrderBook` describe block:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest bitso.test.ts`
Expected: FAIL — `client.getBalances is not a function`.

- [ ] **Step 3: Implement getBalances, getFees, placeOrder**

Add to the `BitsoClient` class in `backend/lib/bitso.ts`, after `getOrderBook`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest bitso.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/lib/bitso.ts backend/__tests__/bitso.test.ts
git commit -m "feat: add BitsoClient getBalances, getFees, placeOrder"
```

---

### Task 4: crypto-indicators.ts — pure indicator functions

**Files:**
- Create: `backend/lib/crypto-indicators.ts`
- Test: `backend/__tests__/crypto-indicators.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions over plain data).
- Produces: `export interface CryptoIndicators { changePctSinceSnapshot: number | null; minutesSinceSnapshot: number | null; orderBookImbalance: number; spreadPct: number; }`, `export interface PriceSnapshotInput { price: number; recordedAt: Date; }`, `export interface OrderBookLevel { price: number; amount: number; }`, `export function calculateCryptoIndicators(params: { currentPrice: number; snapshots: PriceSnapshotInput[]; bids: OrderBookLevel[]; asks: OrderBookLevel[]; }): CryptoIndicators` — consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/__tests__/crypto-indicators.test.ts
import {
  calculatePriceChangeSinceSnapshot,
  calculateOrderBookImbalance,
  calculateSpreadPct,
  calculateCryptoIndicators,
} from '@/lib/crypto-indicators';

describe('calculatePriceChangeSinceSnapshot', () => {
  it('returns null when there are no snapshots yet', () => {
    expect(calculatePriceChangeSinceSnapshot(100, [])).toBeNull();
  });

  it('computes positive percent change from the oldest snapshot', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000);
    const result = calculatePriceChangeSinceSnapshot(1100, [{ price: 1000, recordedAt: thirtyMinAgo }]);
    expect(result).not.toBeNull();
    expect(result!.changePct).toBeCloseTo(10, 5);
    expect(result!.minutesAgo).toBeCloseTo(30, 0);
  });

  it('computes negative percent change', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    const result = calculatePriceChangeSinceSnapshot(950, [{ price: 1000, recordedAt: tenMinAgo }]);
    expect(result!.changePct).toBeCloseTo(-5, 5);
  });
});

describe('calculateOrderBookImbalance', () => {
  it('returns 0 for an empty book', () => {
    expect(calculateOrderBookImbalance([], [])).toBe(0);
  });

  it('returns a positive value when bid volume dominates', () => {
    const bids = [{ price: 100, amount: 8 }];
    const asks = [{ price: 101, amount: 2 }];
    expect(calculateOrderBookImbalance(bids, asks)).toBeCloseTo(0.6, 5); // (8-2)/10
  });

  it('returns a negative value when ask volume dominates', () => {
    const bids = [{ price: 100, amount: 2 }];
    const asks = [{ price: 101, amount: 8 }];
    expect(calculateOrderBookImbalance(bids, asks)).toBeCloseTo(-0.6, 5);
  });

  it('only considers the top N levels given by depth', () => {
    const bids = [{ price: 100, amount: 5 }, { price: 99, amount: 100 }];
    const asks = [{ price: 101, amount: 5 }];
    expect(calculateOrderBookImbalance(bids, asks, 1)).toBeCloseTo(0, 5); // 5 vs 5, ignoring the 100
  });
});

describe('calculateSpreadPct', () => {
  it('computes spread as a percent of the ask price', () => {
    expect(calculateSpreadPct(99, 100)).toBeCloseTo(1, 5);
  });

  it('returns 0 when ask is 0', () => {
    expect(calculateSpreadPct(0, 0)).toBe(0);
  });
});

describe('calculateCryptoIndicators', () => {
  it('combines all sub-indicators, tolerating an empty snapshot history', () => {
    const result = calculateCryptoIndicators({
      currentPrice: 1000,
      snapshots: [],
      bids: [{ price: 999, amount: 5 }],
      asks: [{ price: 1001, amount: 5 }],
    });
    expect(result.changePctSinceSnapshot).toBeNull();
    expect(result.minutesSinceSnapshot).toBeNull();
    expect(result.orderBookImbalance).toBeCloseTo(0, 5);
    expect(result.spreadPct).toBeCloseTo(0.1998, 3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest crypto-indicators.test.ts`
Expected: FAIL — `Cannot find module '@/lib/crypto-indicators'`.

- [ ] **Step 3: Implement crypto-indicators.ts**

```typescript
// backend/lib/crypto-indicators.ts
export interface CryptoIndicators {
  changePctSinceSnapshot: number | null;
  minutesSinceSnapshot: number | null;
  orderBookImbalance: number;
  spreadPct: number;
}

export interface PriceSnapshotInput {
  price: number;
  recordedAt: Date;
}

export interface OrderBookLevel {
  price: number;
  amount: number;
}

// Caller passes snapshots ordered oldest-first (ascending recordedAt); the
// oldest one within the lookback window anchors the "since last check" read.
export function calculatePriceChangeSinceSnapshot(
  currentPrice: number,
  snapshots: PriceSnapshotInput[],
): { changePct: number; minutesAgo: number } | null {
  if (snapshots.length === 0) return null;
  const oldest = snapshots[0];
  if (oldest.price === 0) return null;
  const changePct = ((currentPrice - oldest.price) / oldest.price) * 100;
  const minutesAgo = (Date.now() - oldest.recordedAt.getTime()) / 60_000;
  return { changePct, minutesAgo };
}

export function calculateOrderBookImbalance(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
  depth: number = 10,
): number {
  const bidVolume = bids.slice(0, depth).reduce((sum, level) => sum + level.amount, 0);
  const askVolume = asks.slice(0, depth).reduce((sum, level) => sum + level.amount, 0);
  const total = bidVolume + askVolume;
  if (total === 0) return 0;
  return (bidVolume - askVolume) / total;
}

export function calculateSpreadPct(bestBid: number, bestAsk: number): number {
  if (bestAsk === 0) return 0;
  return ((bestAsk - bestBid) / bestAsk) * 100;
}

export function calculateCryptoIndicators(params: {
  currentPrice: number;
  snapshots: PriceSnapshotInput[];
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}): CryptoIndicators {
  const priceChange = calculatePriceChangeSinceSnapshot(params.currentPrice, params.snapshots);
  const bestBid = params.bids[0]?.price ?? 0;
  const bestAsk = params.asks[0]?.price ?? 0;
  return {
    changePctSinceSnapshot: priceChange?.changePct ?? null,
    minutesSinceSnapshot: priceChange?.minutesAgo ?? null,
    orderBookImbalance: calculateOrderBookImbalance(params.bids, params.asks),
    spreadPct: calculateSpreadPct(bestBid, bestAsk),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest crypto-indicators.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/lib/crypto-indicators.ts backend/__tests__/crypto-indicators.test.ts
git commit -m "feat: add pure crypto indicator functions"
```

---

### Task 5: market-hours.ts — isCryptoOpen + widen isMarketOpen

**Files:**
- Modify: `backend/lib/market-hours.ts`
- Test: `backend/__tests__/market-hours.test.ts`

**Interfaces:**
- Consumes: `Market` from Task 1.
- Produces: `export function isCryptoOpen(): boolean` (always `true`); `isMarketOpen(market: Market): boolean` widened (previously `market: 'MX' | 'USA'`) — consumed by Task 12's `bot/start`/`bot/status` routes.

- [ ] **Step 1: Write the failing test**

Add to `backend/__tests__/market-hours.test.ts` (new `describe` block, alongside the existing ones):

```typescript
describe('isCryptoOpen', () => {
  it('is always true regardless of day or time', () => {
    expect(isCryptoOpen()).toBe(true);
  });
});

describe('isMarketOpen with CRYPTO', () => {
  it('delegates to isCryptoOpen for the CRYPTO market', () => {
    expect(isMarketOpen('CRYPTO')).toBe(true);
  });
});
```

Add `isCryptoOpen` to the existing top-of-file import from `@/lib/market-hours` in that test file (alongside whatever `isBMVOpen`/`isNYSEOpen`/`isMarketOpen` are already imported there).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest market-hours.test.ts`
Expected: FAIL — `isCryptoOpen is not a function` / `isMarketOpen('CRYPTO')` type error under `tsc`, but Jest itself will fail at the missing-export line.

- [ ] **Step 3: Implement isCryptoOpen and widen isMarketOpen**

In `backend/lib/market-hours.ts`, add the import and the two changed/added exports. `isWeekdayInRange`, `isBMVOpen`, `isNYSEOpen` are **not modified** — only the local `type Market = 'MX' | 'USA';` declaration is removed (replaced by the shared import) and `isMarketOpen`'s signature/body change:

```typescript
import { isMarketHoliday, getEarlyCloseTime } from '@/lib/market-holidays';
import { Market } from '@/lib/market';

// (isWeekdayInRange, isBMVOpen, isNYSEOpen unchanged — omitted here, keep as-is)

export function isCryptoOpen(): boolean {
  return true; // Bitso trades 24/7 — no holiday/weekend/hour restrictions
}

export function isMarketOpen(market: Market): boolean {
  if (market === 'MX') return isBMVOpen();
  if (market === 'USA') return isNYSEOpen();
  return isCryptoOpen();
}
```

Concretely: delete line 3 (`type Market = 'MX' | 'USA';`), add the `import { Market } from '@/lib/market';` line under the existing `market-holidays` import, and replace the final `export function isMarketOpen(market: Market): boolean { return market === 'MX' ? isBMVOpen() : isNYSEOpen(); }` with the two functions above. For MX/USA inputs this is behaviorally identical to today (`'MX'` → `isBMVOpen()`, `'USA'` → `isNYSEOpen()`); the only new branch is the CRYPTO fallthrough.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest market-hours.test.ts`
Expected: PASS — all pre-existing tests plus the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/market-hours.ts backend/__tests__/market-hours.test.ts
git commit -m "feat: add isCryptoOpen and widen isMarketOpen to accept CRYPTO"
```

---

### Task 6: bitso-market-data.ts — getCryptoMarketData

**Files:**
- Create: `backend/lib/bitso-market-data.ts`

**Interfaces:**
- Consumes: `bitsoClient` (Task 2/3), `calculateCryptoIndicators`/`CryptoIndicators` (Task 4), `prisma.cryptoPriceSnapshot` (Task 1).
- Produces: `export interface CryptoMarketData { lastPrice: number; changePct24h: number; volume24h: number; high24h: number; low24h: number; indicators: CryptoIndicators; }`, `export async function getCryptoMarketData(book: string): Promise<CryptoMarketData>` — consumed by Task 8.

No Jest test for this file — it's a thin I/O-orchestrating wrapper (network + DB), matching how `databursatil.ts`/`ibkr-market-data.ts` have no dedicated unit tests either (the pure logic they depend on, `indicators.ts`, is what's tested). Verified instead via Task 13's manual preview check.

- [ ] **Step 1: Implement getCryptoMarketData**

```typescript
// backend/lib/bitso-market-data.ts
import { bitsoClient } from '@/lib/bitso';
import { prisma } from '@/lib/prisma';
import { calculateCryptoIndicators, CryptoIndicators } from '@/lib/crypto-indicators';

export interface CryptoMarketData {
  lastPrice: number;
  changePct24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  indicators: CryptoIndicators;
}

const SNAPSHOT_LOOKBACK_MIN = 60;

export async function getCryptoMarketData(book: string): Promise<CryptoMarketData> {
  const [ticker, orderBook] = await Promise.all([
    bitsoClient.getTicker(book),
    bitsoClient.getOrderBook(book),
  ]);

  const since = new Date(Date.now() - SNAPSHOT_LOOKBACK_MIN * 60_000);
  const snapshots = await prisma.cryptoPriceSnapshot.findMany({
    where: { book, recordedAt: { gte: since } },
    orderBy: { recordedAt: 'asc' },
  });

  const indicators = calculateCryptoIndicators({
    currentPrice: ticker.last,
    snapshots,
    bids: orderBook.bids,
    asks: orderBook.asks,
  });

  // Record this cycle's price for future cycles' "since last check" comparison
  // — the crypto equivalent of recordLastPrice in trading-context.ts, kept in
  // its own table since crypto never touches trading-context.ts (see plan
  // Global Constraints).
  await prisma.cryptoPriceSnapshot.create({ data: { book, price: ticker.last } });

  const previousPrice = ticker.last - ticker.change24;
  const changePct24h = previousPrice !== 0 ? (ticker.change24 / previousPrice) * 100 : 0;

  return {
    lastPrice: ticker.last,
    changePct24h,
    volume24h: ticker.volume,
    high24h: ticker.high,
    low24h: ticker.low,
    indicators,
  };
}
```

- [ ] **Step 2: Verify the build**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/lib/bitso-market-data.ts
git commit -m "feat: add getCryptoMarketData combining Bitso ticker, order book, and price snapshots"
```

---

### Task 7: crypto-agent.ts — system prompt + user prompt builder

**Files:**
- Create: `backend/lib/crypto-agent.ts`

**Interfaces:**
- Consumes: nothing yet from this task's own file (self-contained prompt text + a pure formatting function).
- Produces: `SYSTEM_PROMPT_CRYPTO: string`, `buildCryptoUserPrompt(p: BuildCryptoUserPromptParams): string` — both module-private (not exported), consumed later in this same file by Task 8.

- [ ] **Step 1: Implement the system prompt and user prompt builder**

```typescript
// backend/lib/crypto-agent.ts
import { CryptoIndicators } from '@/lib/crypto-indicators';

interface ClaudeDecision {
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  confidence: number;
  reason: string;
}

const SYSTEM_PROMPT_CRYPTO = `You are an expert cryptocurrency trader on Bitso, a CNBV-regulated Mexican exchange.
You trade a small, curated list of major coins (e.g. BTC, ETH) against the Mexican peso (MXN). Unlike the stock
markets, crypto trades 24/7 with no open/close — expect higher volatility and thinner order books outside
Mexican business hours.

Your PRIMARY strategy is scalping: take many small, frequent gains of roughly 0.5%-2% per trade rather than
holding for large moves. Lock in profits early and cut losses quickly — a fast, reliable small win beats a slow,
uncertain large one. You are expected to complete full buy-then-sell round trips on the same symbol multiple
times in a single day when the signal supports it.

You do NOT have access to traditional technical indicators (RSI, moving averages) for crypto — instead you are
given the price change since the last time this symbol was checked, the order book imbalance (whether buy or
sell pressure currently dominates), and the bid/ask spread. Use these to judge short-term momentum and whether
the current spread leaves enough room for a profitable round trip after fees.

EXCEPTION: you may hold a position longer than the usual scalping target only when order book imbalance and
recent price momentum both strongly favor continuation. If you decide to deviate from the default scalping
behavior and hold for a larger move, you MUST say so explicitly in "reason".

Your goal is to generate consistent returns in Mexican pesos while managing risk tightly on every trade.
You MUST respond ONLY with valid JSON in this exact format:
{"action":"buy"|"sell"|"hold","quantity":0,"confidence":0.0,"reason":"..."}`;

function sign(n: number): string { return n >= 0 ? '+' : ''; }

interface BuildCryptoUserPromptParams {
  symbol: string; // Bitso book, e.g. "btc_mxn"
  lastPrice: number;
  changePct24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  indicators: CryptoIndicators;
  currentPosition: number; // fractional coin quantity held
  currentPositionAvgCost: number;
  availableFunds: number; // MXN cash
  capitalLimit: number | undefined;
  effectiveCapital: number;
  netLiquidation: number;
  totalUnrealizedPnl: number;
  intervalMin: number;
  confidenceThreshold: number;
  takeProfitPct: number;
  stopLossPct: number;
  feeEstimatePct: number;
  recentTradesText: string;
}

function buildCryptoUserPrompt(p: BuildCryptoUserPromptParams): string {
  const {
    symbol, lastPrice, changePct24h, volume24h, high24h, low24h, indicators,
    currentPosition, currentPositionAvgCost, availableFunds, capitalLimit,
    effectiveCapital, netLiquidation, totalUnrealizedPnl, intervalMin,
    confidenceThreshold, takeProfitPct, stopLossPct, feeEstimatePct, recentTradesText,
  } = p;

  const currency = 'MXN';
  const baseAsset = symbol.split('_')[0].toUpperCase();
  const maxInvestment = effectiveCapital * 0.20;
  const maxQuantity = lastPrice > 0 ? maxInvestment / lastPrice : 0;

  const symbolUnrealizedPnlPct = currentPosition > 0 && currentPositionAvgCost > 0
    ? ((lastPrice - currentPositionAvgCost) / currentPositionAvgCost) * 100
    : null;

  const positionLine = currentPosition > 0
    ? `${currentPosition.toFixed(8)} ${baseAsset} already held (avg cost ${currentPositionAvgCost.toFixed(2)} ${currency})` +
      (symbolUnrealizedPnlPct != null
        ? ` — unrealized P&L on this position: ${sign(symbolUnrealizedPnlPct)}${symbolUnrealizedPnlPct.toFixed(2)}%`
        : '')
    : 'no current position';

  const sinceSnapshotLine = indicators.changePctSinceSnapshot != null && indicators.minutesSinceSnapshot != null
    ? `${sign(indicators.changePctSinceSnapshot)}${indicators.changePctSinceSnapshot.toFixed(2)}% over the last ${indicators.minutesSinceSnapshot.toFixed(0)} minutes — short-term momentum`
    : 'not enough price history yet this hour — treat as a neutral/first read for this symbol';

  const imbalanceLabel = indicators.orderBookImbalance > 0.2
    ? 'buy pressure dominates'
    : indicators.orderBookImbalance < -0.2
      ? 'sell pressure dominates'
      : 'roughly balanced';

  const tpSlStatusLine = currentPosition > 0 && symbolUnrealizedPnlPct != null
    ? `Current unrealized P&L on this position: ${sign(symbolUnrealizedPnlPct)}${symbolUnrealizedPnlPct.toFixed(2)}% — ` +
      (symbolUnrealizedPnlPct >= takeProfitPct
        ? 'AT OR ABOVE take-profit target — strongly consider selling now.'
        : symbolUnrealizedPnlPct <= -stopLossPct
          ? 'AT OR BELOW stop-loss threshold — strongly consider selling now.'
          : 'within normal range — no TP/SL trigger yet.')
    : 'No open position in this symbol — take-profit/stop-loss do not apply until a position is opened.';

  return `You are being asked to analyze ${symbol} and return a trading decision as JSON.

━━━ CHECK FREQUENCY ━━━
This analysis cycle runs every ${intervalMin} minute${intervalMin === 1 ? '' : 's'}, 24/7 (crypto never closes).
Implication: you will see this symbol again soon. Avoid acting on a marginal signal — wait for the next cycle
if conditions are unclear. This is a scalping strategy: completing multiple full buy-then-sell round trips on
${symbol} across the day is expected when signals support it — do not treat an earlier trade today as a
reason to sit out a new signal now.

━━━ MARKET DATA ━━━
Symbol       : ${symbol}
Last Price   : ${lastPrice.toFixed(2)} ${currency}
24h Change   : ${sign(changePct24h)}${changePct24h.toFixed(2)}%
24h Volume   : ${volume24h.toFixed(4)} ${baseAsset}
24h High/Low : ${high24h.toFixed(2)} / ${low24h.toFixed(2)} ${currency}
Since Last Check: ${sinceSnapshotLine}

━━━ ORDER BOOK ━━━
Order Book Imbalance: ${indicators.orderBookImbalance.toFixed(2)} (-1 = all sell pressure, +1 = all buy pressure) → ${imbalanceLabel}
Bid/Ask Spread      : ${indicators.spreadPct.toFixed(3)}% — wider spread eats into round-trip profit; factor this in alongside fees below

━━━ CAPITAL FOR THIS CYCLE ━━━
Capital limit per cycle : ${capitalLimit != null ? `${capitalLimit.toFixed(2)} ${currency}` : 'not set (no cap)'}
  — This is the absolute maximum the user allows to deploy in a single bot cycle. Do not exceed it.
Available funds         : ${availableFunds.toFixed(2)} ${currency}
Effective capital       : ${effectiveCapital.toFixed(2)} ${currency}  — min(capital limit, available funds); your actual budget
Max per position (20%)  : ${maxInvestment.toFixed(2)} ${currency}  — hard cap per symbol = 20% of effective capital
Max quantity you can buy: ${maxQuantity.toFixed(8)} ${baseAsset}  — max per position / last price (fractional amounts are fine)

━━━ POSITION ━━━
Net value (cash + this position): ${netLiquidation.toFixed(2)} ${currency}
Total Unrealized P&L            : ${sign(totalUnrealizedPnl)}${totalUnrealizedPnl.toFixed(2)} ${currency}
Current position in ${symbol}: ${positionLine}

━━━ RISK MANAGEMENT (TAKE PROFIT / STOP LOSS) ━━━
Take-profit target : +${takeProfitPct.toFixed(2)}% — if you hold ${symbol} and unrealized P&L on this position has reached or passed this level, sell (take the win) unless the EXCEPTION in your system prompt clearly applies and you state so in "reason".
Stop-loss threshold : -${stopLossPct.toFixed(2)}% — if you hold ${symbol} and unrealized P&L on this position has fallen to or past this level, sell to cut the loss. Do not "wait it out" past this threshold.
${tpSlStatusLine}

━━━ TRADING COSTS ━━━
Estimated round-trip cost (fees + spread): ~${feeEstimatePct.toFixed(2)}% of trade value (buy + sell combined, Bitso taker fees).
Rule of thumb: only take a trade if your expected edge is at least 2x this cost (~${(feeEstimatePct * 2).toFixed(2)}%) — otherwise fees can erase a small scalping gain.

━━━ TRADING CONTEXT ━━━
${recentTradesText}

━━━ DECISION RULES ━━━
1. quantity must be 0 when action is "hold"
2. Never exceed max quantity (${maxQuantity.toFixed(8)} ${baseAsset}) for a buy — fractional quantities are expected and fine
3. Never sell more than currently held in ${symbol} (${currentPosition.toFixed(8)} ${baseAsset})
4. Effective capital limit (${effectiveCapital.toFixed(2)} ${currency}) is a hard ceiling — do not exceed it
5. If the portfolio is already heavily invested (>80%), prefer hold over adding new positions unless signal is very strong
6. If you already hold ${symbol}, do not buy more of it right after a recent buy without a genuinely fresh signal. Full buy-then-sell round trips on the same symbol are expected multiple times per day when the signal supports it.
7. Apply the take-profit and stop-loss levels above: if held and at/above take-profit, prefer sell; if held and at/below stop-loss, prefer sell — unless the EXCEPTION for strong aligned momentum clearly applies (state this explicitly in "reason" if so)
8. Do not take a buy or sell whose expected edge is smaller than roughly 2x the estimated round-trip trading cost above
9. Set confidence < ${confidenceThreshold.toFixed(2)} if conditions are ambiguous; the bot will skip execution below the threshold

Respond with JSON only: {"action":"buy"|"sell"|"hold","quantity":0,"confidence":0.0,"reason":"..."}`;
}
```

- [ ] **Step 2: Verify the build**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0. (`SYSTEM_PROMPT_CRYPTO`/`buildCryptoUserPrompt`/`ClaudeDecision` are unused-but-declared at this point — TS won't error on unused top-level consts/functions in this codebase's config, only unused locals; Task 8 wires them in immediately after.)

- [ ] **Step 3: Commit**

```bash
git add backend/lib/crypto-agent.ts
git commit -m "feat: add crypto system prompt and user prompt builder"
```

---

### Task 8: crypto-agent.ts — request context builder + preview

**Files:**
- Modify: `backend/lib/crypto-agent.ts`

**Interfaces:**
- Consumes: `getCryptoMarketData` (Task 6), `bitsoClient` (Task 2/3), `SYSTEM_PROMPT_CRYPTO`/`buildCryptoUserPrompt` (Task 7), `prisma`.
- Produces: `export interface CryptoAgentRequestContext { request: ClaudeRequestBody; lastPrice; changePct24h; volume24h; indicators; currentPosition; currentAvgCost; availableFunds; effectiveCapital; netLiquidation; totalUnrealizedPnl; }`, `export interface CryptoAgentRequestPreview { symbol; market: 'CRYPTO'; readable: {...}; request: ClaudeRequestBody; }`, `export async function previewCryptoAgentRequest(): Promise<CryptoAgentRequestPreview>` — consumed by Task 10 (claude-agent.ts dispatch) and, later, the `agent/preview` route (already accepts CRYPTO via Task 12).

- [ ] **Step 1: Implement the context builder, avg-cost helper, and preview function**

Add to `backend/lib/crypto-agent.ts`, after `buildCryptoUserPrompt` (and add the two new imports at the top of the file, alongside the existing `crypto-indicators` import):

```typescript
import { bitsoClient } from '@/lib/bitso';
import { getCryptoMarketData } from '@/lib/bitso-market-data';
import { prisma } from '@/lib/prisma';
```

```typescript
interface ClaudeRequestBody {
  model: string;
  max_tokens: number;
  temperature: number;
  system: string;
  messages: { role: 'user'; content: string }[];
}

const DEFAULT_CRYPTO_FEE_ESTIMATE_PCT = 0.65; // round-trip fallback if getFees() can't be reached; overridden per-book below when available

interface TradeForAvgCost {
  action: string;
  quantity: number;
  price: number;
  createdAt: Date;
}

// Bitso's balance endpoint reports total holdings but not cost basis, so avg
// cost is derived from this app's own recorded buy/sell trades for the
// symbol — a FIFO walk over the still-open quantity, same technique pnl.ts
// uses for realized P&L. Bounded to the last 200 trades for this symbol,
// which comfortably covers the curated small-symbol-list MVP.
function computeAvgCostFromTrades(trades: TradeForAvgCost[], currentPosition: number): number {
  if (currentPosition <= 0) return 0;
  const sorted = [...trades].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const lots: { quantity: number; price: number }[] = [];
  for (const t of sorted) {
    if (t.action === 'buy') {
      lots.push({ quantity: t.quantity, price: t.price });
    } else if (t.action === 'sell') {
      let remaining = t.quantity;
      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0];
        const matched = Math.min(lot.quantity, remaining);
        lot.quantity -= matched;
        remaining -= matched;
        if (lot.quantity <= 0) lots.shift();
      }
    }
  }
  const totalQty = lots.reduce((sum, l) => sum + l.quantity, 0);
  if (totalQty <= 0) return 0;
  const totalCost = lots.reduce((sum, l) => sum + l.quantity * l.price, 0);
  return totalCost / totalQty;
}

export interface CryptoAgentRequestContext {
  request: ClaudeRequestBody;
  lastPrice: number;
  changePct24h: number;
  volume24h: number;
  indicators: CryptoIndicators;
  currentPosition: number;
  currentAvgCost: number;
  availableFunds: number;
  effectiveCapital: number;
  netLiquidation: number;
  totalUnrealizedPnl: number;
}

interface CryptoAgentCycleConfig {
  capitalLimit?: number;
  confidenceThreshold?: number;
  intervalMin?: number;
  takeProfitPct?: number;
  stopLossPct?: number;
  feeEstimatePct?: number;
}

async function buildCryptoAgentRequestContext(
  symbol: string,
  config: CryptoAgentCycleConfig,
): Promise<CryptoAgentRequestContext> {
  const {
    capitalLimit,
    intervalMin = 15,
    confidenceThreshold = 0.65,
    takeProfitPct = 1.5,
    stopLossPct = 1.0,
  } = config;

  const marketData = await getCryptoMarketData(symbol);
  const [baseCurrency, quoteCurrency] = symbol.split('_');

  const [balances, fees, recentTrades] = await Promise.all([
    bitsoClient.getBalances(),
    bitsoClient.getFees(),
    prisma.trade.findMany({
      where: { market: 'CRYPTO', symbol },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);

  const baseBalance  = balances.find(b => b.currency === baseCurrency);
  const quoteBalance = balances.find(b => b.currency === quoteCurrency);
  const currentPosition = baseBalance?.total ?? 0;

  const bookFee = fees.find(f => f.book === symbol);
  const feeEstimatePct = config.feeEstimatePct
    ?? (bookFee ? bookFee.takerFeeDecimal * 100 * 2 : DEFAULT_CRYPTO_FEE_ESTIMATE_PCT);

  const availableFunds   = quoteBalance?.available ?? 0;
  const effectiveCapital = capitalLimit ? Math.min(availableFunds, capitalLimit) : availableFunds;
  const currentAvgCost   = computeAvgCostFromTrades(recentTrades, currentPosition);
  const totalUnrealizedPnl = currentPosition > 0 && currentAvgCost > 0
    ? (marketData.lastPrice - currentAvgCost) * currentPosition
    : 0;
  const netLiquidation = availableFunds + currentPosition * marketData.lastPrice;

  const recentTradesText = recentTrades.length > 0
    ? "RECENT TRADES (last 10):\n" + recentTrades
        .slice(0, 10)
        .slice()
        .reverse()
        .map(t => `• ${t.createdAt.toISOString()}  ${t.action.toUpperCase()} ${symbol} ×${t.quantity} @ ${t.price.toFixed(2)} MXN`)
        .join('\n')
    : 'RECENT TRADES: none yet for this symbol';

  const request: ClaudeRequestBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    temperature: 0.2,
    system: SYSTEM_PROMPT_CRYPTO,
    messages: [
      {
        role: 'user',
        content: buildCryptoUserPrompt({
          symbol,
          lastPrice: marketData.lastPrice,
          changePct24h: marketData.changePct24h,
          volume24h: marketData.volume24h,
          high24h: marketData.high24h,
          low24h: marketData.low24h,
          indicators: marketData.indicators,
          currentPosition,
          currentPositionAvgCost: currentAvgCost,
          availableFunds,
          capitalLimit,
          effectiveCapital,
          netLiquidation,
          totalUnrealizedPnl,
          intervalMin,
          confidenceThreshold,
          takeProfitPct,
          stopLossPct,
          feeEstimatePct,
          recentTradesText,
        }),
      },
    ],
  };

  return {
    request,
    lastPrice: marketData.lastPrice,
    changePct24h: marketData.changePct24h,
    volume24h: marketData.volume24h,
    indicators: marketData.indicators,
    currentPosition,
    currentAvgCost,
    availableFunds,
    effectiveCapital,
    netLiquidation,
    totalUnrealizedPnl,
  };
}

export interface CryptoAgentRequestPreview {
  symbol: string;
  market: 'CRYPTO';
  readable: {
    lastPrice: number;
    changePct24h: number;
    volume24h: number;
    currency: string;
    orderBookImbalance: number;
    spreadPct: number;
    changePctSinceSnapshot: number | null;
    capitalLimit: number | null;
    intervalMin: number;
    availableFunds: number;
    effectiveCapital: number;
    netLiquidation: number;
    totalUnrealizedPnl: number;
    currentPosition: number;
    currentAvgCost: number;
  };
  request: ClaudeRequestBody;
}

export async function previewCryptoAgentRequest(): Promise<CryptoAgentRequestPreview> {
  const config = await prisma.botConfig.findUnique({ where: { market: 'CRYPTO' } });
  const symbol = config?.symbols?.[0];
  if (!symbol) {
    throw new Error('No symbols configured for CRYPTO — add at least one symbol in Bot Config first');
  }

  const capitalLimit        = config?.capitalLimit ?? undefined;
  const intervalMin         = config?.intervalMin ?? 15;
  const confidenceThreshold = config?.confidenceThreshold ?? 0.65;
  const takeProfitPct       = config?.takeProfitPct ?? 1.5;
  const stopLossPct         = config?.stopLossPct ?? 1.0;
  const feeEstimatePct      = config?.feeEstimatePct ?? undefined;

  const ctx = await buildCryptoAgentRequestContext(symbol, {
    capitalLimit, intervalMin, confidenceThreshold, takeProfitPct, stopLossPct, feeEstimatePct,
  });

  return {
    symbol,
    market: 'CRYPTO',
    readable: {
      lastPrice: ctx.lastPrice,
      changePct24h: ctx.changePct24h,
      volume24h: ctx.volume24h,
      currency: 'MXN',
      orderBookImbalance: ctx.indicators.orderBookImbalance,
      spreadPct: ctx.indicators.spreadPct,
      changePctSinceSnapshot: ctx.indicators.changePctSinceSnapshot,
      capitalLimit: capitalLimit ?? null,
      intervalMin,
      availableFunds: ctx.availableFunds,
      effectiveCapital: ctx.effectiveCapital,
      netLiquidation: ctx.netLiquidation,
      totalUnrealizedPnl: ctx.totalUnrealizedPnl,
      currentPosition: ctx.currentPosition,
      currentAvgCost: ctx.currentAvgCost,
    },
    request: ctx.request,
  };
}
```

Note: `config?.feeEstimatePct` on `BotConfig` is typed `number` (not nullable) in the Prisma schema with a `@default(0.10)`, so `config?.feeEstimatePct ?? undefined` only actually falls back to `undefined` when `config` itself is `null` (no CRYPTO row saved yet) — same pattern already used for `capitalLimit` above it.

- [ ] **Step 2: Verify the build**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/lib/crypto-agent.ts
git commit -m "feat: add crypto agent request context builder and preview"
```

---

### Task 9: crypto-agent.ts — runCryptoAgentCycle

**Files:**
- Modify: `backend/lib/crypto-agent.ts`

**Interfaces:**
- Consumes: `buildCryptoAgentRequestContext` (Task 8, same file), `bitsoClient.placeOrder` (Task 3), `writeBotLog`, `prisma`, `anthropic` (new in this task).
- Produces: `export async function runCryptoAgentCycle(symbol: string, config: CryptoAgentCycleConfig = {}): Promise<AgentCycleResult>` where `AgentCycleResult` matches `claude-agent.ts`'s existing exported shape (`{action, quantity, confidence, reason, executed}`) — consumed by Task 10's dispatch guard in `claude-agent.ts`.

- [ ] **Step 1: Implement runCryptoAgentCycle**

Add to the top of `backend/lib/crypto-agent.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { writeBotLog } from '@/lib/bot-logger';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AgentCycleResult {
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  confidence: number;
  reason: string;
  executed: boolean;
}
```

Add to the bottom of `backend/lib/crypto-agent.ts`, after `previewCryptoAgentRequest`:

```typescript
export async function runCryptoAgentCycle(
  symbol: string,
  config: CryptoAgentCycleConfig = {},
): Promise<AgentCycleResult> {
  const {
    confidenceThreshold = 0.65,
  } = config;

  const ctx = await buildCryptoAgentRequestContext(symbol, config);
  const { lastPrice, indicators, currentPosition, effectiveCapital } = ctx;

  const message = await anthropic.messages.create(ctx.request);

  const rawText  = message.content[0].type === 'text' ? message.content[0].text : '';
  const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let decision: ClaudeDecision;
  try {
    decision = JSON.parse(cleanText) as ClaudeDecision;
  } catch {
    decision = { action: 'hold', quantity: 0, confidence: 0, reason: `Parse error: ${rawText}` };
  }

  const maxInvestment = effectiveCapital * 0.20;
  const maxQuantity   = lastPrice > 0 ? maxInvestment / lastPrice : 0;

  if (decision.action === 'buy'  && decision.quantity > maxQuantity)     decision.quantity = maxQuantity;
  if (decision.action === 'sell' && decision.quantity > currentPosition) decision.quantity = currentPosition;

  let executed = false;
  let orderId: string | undefined;

  if (
    (decision.action === 'buy' || decision.action === 'sell') &&
    decision.confidence < confidenceThreshold &&
    decision.quantity > 0
  ) {
    await writeBotLog({
      level: 'warn',
      event: 'order_skipped',
      market: 'CRYPTO',
      symbol,
      message: `${symbol} ${decision.action.toUpperCase()} x${decision.quantity} skipped — confidence ${decision.confidence.toFixed(2)} below ${confidenceThreshold.toFixed(2)} threshold`,
      meta: { action: decision.action, quantity: decision.quantity, confidence: decision.confidence, threshold: confidenceThreshold },
    });
  }

  if (
    (decision.action === 'buy' || decision.action === 'sell') &&
    decision.confidence >= confidenceThreshold &&
    decision.quantity > 0
  ) {
    try {
      orderId = await bitsoClient.placeOrder({
        book: symbol,
        side: decision.action,
        major: decision.quantity.toString(),
      });
      executed = true;
      await writeBotLog({
        level: 'info',
        event: 'order_placed',
        market: 'CRYPTO',
        symbol,
        message: `${symbol} ${decision.action.toUpperCase()} x${decision.quantity} @ ${lastPrice.toFixed(2)} MXN — order #${orderId}`,
      });
    } catch (err) {
      await writeBotLog({
        level: 'warn',
        event: 'order_skipped',
        market: 'CRYPTO',
        symbol,
        message: `${symbol} ${decision.action.toUpperCase()} x${decision.quantity} — Bitso rejected: ${(err as Error).message}`,
        meta: { action: decision.action, quantity: decision.quantity },
      });
    }
  }

  await prisma.agentLog.create({
    data: {
      symbol,
      market: 'CRYPTO',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      marketData: JSON.parse(JSON.stringify({ lastPrice, indicators })),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: JSON.parse(JSON.stringify(decision)),
      executed,
    },
  });

  let cycleNote = '';
  if (decision.action !== 'hold') {
    if (executed)                                      cycleNote = ` — executed (order #${orderId ?? ''})`;
    else if (decision.confidence < confidenceThreshold) cycleNote = ` — skipped: confidence ${decision.confidence.toFixed(2)} below ${confidenceThreshold.toFixed(2)} threshold`;
    else if (decision.quantity === 0)                  cycleNote = ` — skipped: quantity 0`;
  }

  await writeBotLog({
    level: 'info',
    event: 'cycle_complete',
    market: 'CRYPTO',
    symbol,
    message: `${symbol} → ${decision.action.toUpperCase()} x${decision.quantity} (confidence ${decision.confidence.toFixed(2)})${cycleNote}`,
    meta: { action: decision.action, quantity: decision.quantity, confidence: decision.confidence, executed },
  });

  if (executed) {
    await prisma.trade.create({
      data: {
        symbol,
        market: 'CRYPTO',
        action: decision.action,
        quantity: decision.quantity,
        price: lastPrice,
        currency: 'MXN',
        reason: decision.reason,
        // Trade.ibkrOrderId is a generically-named opaque order-id column —
        // reused here for the Bitso order id rather than adding a new column
        // or renaming it (renaming would require touching claude-agent.ts's
        // MX/USA usages of the same field, which this plan avoids).
        ibkrOrderId: orderId,
      },
    });
  }

  return { ...decision, executed };
}
```

- [ ] **Step 2: Verify the build**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/lib/crypto-agent.ts
git commit -m "feat: add runCryptoAgentCycle — decision, order placement, logging"
```

---

### Task 10: claude-agent.ts — wire CRYPTO dispatch guards

**Files:**
- Modify: `backend/lib/claude-agent.ts:1-9` (imports), `:395` (`previewAgentRequest` signature), `:439-443` (`runAgentCycle` signature)

**Interfaces:**
- Consumes: `Market` (Task 1), `previewCryptoAgentRequest`/`CryptoAgentRequestPreview` (Task 8), `runCryptoAgentCycle` (Task 9).
- Produces: `previewAgentRequest(market: Market): Promise<AgentRequestPreview | CryptoAgentRequestPreview>`, `runAgentCycle(symbol: string, market: Market, config?: AgentCycleConfig): Promise<AgentCycleResult>` — both now accept `'CRYPTO'`. No other line in this file changes: `buildAgentRequestContext` is a private helper only ever called from the narrowed (`'MX' | 'USA'`) branch of these two functions after the guard clause, so it keeps its original `market: 'MX' | 'USA'` signature and body untouched — same for `SYSTEM_PROMPTS`, `buildUserPrompt`, and every ternary inside them.

- [ ] **Step 1: Add the new imports**

At the top of `backend/lib/claude-agent.ts`, add two lines after the existing `import { buildContextSection, ... } from '@/lib/trading-context';` line (line 9):

```typescript
import { Market } from '@/lib/market';
import { previewCryptoAgentRequest, runCryptoAgentCycle, CryptoAgentRequestPreview } from '@/lib/crypto-agent';
```

- [ ] **Step 2: Widen previewAgentRequest and add the guard clause**

Change (around line 395):

```typescript
export async function previewAgentRequest(market: 'MX' | 'USA'): Promise<AgentRequestPreview> {
```

to:

```typescript
export async function previewAgentRequest(market: Market): Promise<AgentRequestPreview | CryptoAgentRequestPreview> {
  if (market === 'CRYPTO') return previewCryptoAgentRequest();

```

Every line after this inside the function body is unchanged — TypeScript narrows `market` to `'MX' | 'USA'` for the rest of the function automatically after the early return.

- [ ] **Step 3: Widen runAgentCycle and add the guard clause**

Change (around line 439-443):

```typescript
export async function runAgentCycle(
  symbol: string,
  market: 'MX' | 'USA',
  config: AgentCycleConfig = {},
): Promise<AgentCycleResult> {
```

to:

```typescript
export async function runAgentCycle(
  symbol: string,
  market: Market,
  config: AgentCycleConfig = {},
): Promise<AgentCycleResult> {
  if (market === 'CRYPTO') return runCryptoAgentCycle(symbol, config);

```

Every line after this inside the function body is unchanged, for the same narrowing reason as Step 2.

- [ ] **Step 4: Verify the build**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Run the full existing test suite to confirm zero regressions**

Run: `cd backend && npx jest`
Expected: PASS — every pre-existing test (`ibkr.test.ts`, `ibkr-market-data.test.ts`, `indicators.test.ts`, `market-hours.test.ts`, `databursatil.test.ts`) plus the new `bitso.test.ts`/`crypto-indicators.test.ts` all pass, none modified.

- [ ] **Step 6: Commit**

```bash
git add backend/lib/claude-agent.ts
git commit -m "feat: dispatch runAgentCycle/previewAgentRequest to the crypto path for CRYPTO market"
```

---

### Task 11: pnl.ts — widen Market, add CRYPTO timezone/currency

**Files:**
- Modify: `backend/lib/pnl.ts`

**Interfaces:**
- Consumes: `Market` (Task 1).
- Produces: `getPnlReport(market: Market): Promise<PnlReport>` widened (previously `'MX' | 'USA'`) — consumed by Task 12's `pnl` route.

- [ ] **Step 1: Widen the Market type and add the CRYPTO branch**

In `backend/lib/pnl.ts`, replace the top of the file:

```typescript
import { prisma } from '@/lib/prisma';

const MARKET_TIMEZONE: Record<'MX' | 'USA', string> = {
  MX: 'America/Mexico_City',
  USA: 'America/New_York',
};
```

with:

```typescript
import { prisma } from '@/lib/prisma';
import { Market } from '@/lib/market';

const MARKET_TIMEZONE: Record<Market, string> = {
  MX: 'America/Mexico_City',
  USA: 'America/New_York',
  // Crypto trades 24/7 with no natural "trading day" boundary — bucket by
  // the same timezone used for the user's other reports, for consistency.
  CRYPTO: 'America/Mexico_City',
};
```

Then replace every remaining `market: 'MX' | 'USA'` parameter type in the file (`dateKey`, `computeRealizedPnlEvents`, `getPnlReport`) with `market: Market`, and widen `PnlReport.market: 'MX' | 'USA'` to `PnlReport.market: Market`. Finally, replace the currency ternary in `getPnlReport`:

```typescript
  const currency = market === 'MX' ? 'MXN' : 'USD';
```

with:

```typescript
  const currency = market === 'MX' ? 'MXN' : market === 'USA' ? 'USD' : 'MXN';
```

- [ ] **Step 2: Verify the build and existing tests**

Run: `cd backend && npx tsc --noEmit && npx jest`
Expected: both exit 0 / PASS. (`pnl.ts` has no dedicated Jest test file today, so this is a compile + full-suite regression check.)

- [ ] **Step 3: Commit**

```bash
git add backend/lib/pnl.ts
git commit -m "feat: widen pnl.ts to support the CRYPTO market"
```

---

### Task 12: API routes — widen market validation for CRYPTO

**Files:**
- Modify: `backend/app/api/bot/config/route.ts`
- Modify: `backend/app/api/bot/start/route.ts`
- Modify: `backend/app/api/bot/stop/route.ts`
- Modify: `backend/app/api/bot/status/route.ts`
- Modify: `backend/app/api/agent/run/route.ts`
- Modify: `backend/app/api/agent/preview/route.ts`
- Modify: `backend/app/api/agent/logs/route.ts`
- Modify: `backend/app/api/pnl/route.ts`
- Modify: `backend/app/api/trades/route.ts`

**Interfaces:**
- Consumes: `Market` (Task 1), `isCryptoOpen` (Task 5), `runAgentCycle`/`previewAgentRequest` (Task 10, already CRYPTO-aware), `getPnlReport` (Task 11, already CRYPTO-aware).
- Produces: all 9 routes now accept `market: 'CRYPTO'` end-to-end.

- [ ] **Step 1: bot/config/route.ts — widen the body type**

Change line 6 from `market: 'MX' | 'USA';` to `market: Market;`, and add `import { Market } from '@/lib/market';` to the top imports. `prisma.botConfig.upsert` already treats `market` as a plain string — no other change.

- [ ] **Step 2: bot/start/route.ts — widen the body type and skip IBKR keep-alive for CRYPTO**

Add `import { Market } from '@/lib/market';` to the imports. Change line 17 from `market: 'MX' | 'USA';` to `market: Market;`. Change line 50:

```typescript
  ibkrClient.startKeepAlive();
```

to:

```typescript
  if (market !== 'CRYPTO') ibkrClient.startKeepAlive();
```

The `setInterval` loop below it (lines 57-76) needs no change — it already calls `isMarketOpen(market)` (widened in Task 5) and `runAgentCycle(symbol, market, {...})` (widened in Task 10), both of which now correctly handle `'CRYPTO'`.

- [ ] **Step 3: bot/stop/route.ts — widen the body type and skip IBKR/trading-context calls for CRYPTO**

Add `import { Market } from '@/lib/market';` to the imports. Change line 8 from `market: 'MX' | 'USA';` to `market: Market;`. Change lines 23-24:

```typescript
  ibkrClient.stopKeepAlive();
  await resetDailyContext();
```

to:

```typescript
  if (market !== 'CRYPTO') {
    ibkrClient.stopKeepAlive();
    await resetDailyContext();
  }
```

This matters: `resetDailyContext()` resets the single shared `trading-context.ts` JSON file used by MX/USA — calling it when stopping the CRYPTO bot would wipe MX/USA's "today's executed trades" context too, since that file isn't partitioned by market. Crypto never writes to that file (Task 6/8/9 build its own trading-context equivalent directly from the `Trade` table), so it must not reset it either.

- [ ] **Step 4: bot/status/route.ts — widen the query type and report CRYPTO market hours**

Add `import { Market } from '@/lib/market';` and `isCryptoOpen` (alongside the existing `isBMVOpen, isNYSEOpen` import) to the imports. Change line 7 from `const market = searchParams.get('market') as 'MX' | 'USA' | null;` to `const market = searchParams.get('market') as Market | null;`. Change lines 13-16:

```typescript
  return NextResponse.json({
    configs,
    markets: { MX: isBMVOpen(), USA: isNYSEOpen() },
  });
```

to:

```typescript
  return NextResponse.json({
    configs,
    markets: { MX: isBMVOpen(), USA: isNYSEOpen(), CRYPTO: isCryptoOpen() },
  });
```

- [ ] **Step 5: agent/run/route.ts — widen the body type and simplify the fee fallback**

Add `import { Market } from '@/lib/market';` to the imports. Change line 6 from `const body = await request.json() as { symbol: string; market: 'MX' | 'USA' };` to `const body = await request.json() as { symbol: string; market: Market };`. Change lines 15-22:

```typescript
    const result = await runAgentCycle(symbol, market, {
      capitalLimit: config?.capitalLimit ?? undefined,
      confidenceThreshold: config?.confidenceThreshold ?? 0.65,
      intervalMin: config?.intervalMin ?? 15,
      takeProfitPct: config?.takeProfitPct ?? 1.5,
      stopLossPct: config?.stopLossPct ?? 1.0,
      feeEstimatePct: config?.feeEstimatePct ?? (market === 'MX' ? 0.30 : 0.05),
    });
```

to:

```typescript
    const result = await runAgentCycle(symbol, market, {
      capitalLimit: config?.capitalLimit ?? undefined,
      confidenceThreshold: config?.confidenceThreshold ?? 0.65,
      intervalMin: config?.intervalMin ?? 15,
      takeProfitPct: config?.takeProfitPct ?? 1.5,
      stopLossPct: config?.stopLossPct ?? 1.0,
      feeEstimatePct: config?.feeEstimatePct ?? undefined,
    });
```

This removes the route's own MX/USA-only fallback ternary (which had no CRYPTO branch and would silently apply the wrong default) and instead lets `runAgentCycle`/`runCryptoAgentCycle` apply their own per-market default internally when `feeEstimatePct` is `undefined` — for MX/USA this produces the exact same value as before (`DEFAULT_FEE_ESTIMATE_PCT.MX` = 0.30, `.USA` = 0.05, unchanged in `claude-agent.ts`), just computed in one place instead of two.

- [ ] **Step 6: agent/preview/route.ts — accept CRYPTO**

Change lines 10-12:

```typescript
  if (market !== 'MX' && market !== 'USA') {
    return NextResponse.json({ error: 'market query param must be MX or USA' }, { status: 400 });
  }
```

to:

```typescript
  if (market !== 'MX' && market !== 'USA' && market !== 'CRYPTO') {
    return NextResponse.json({ error: 'market query param must be MX, USA, or CRYPTO' }, { status: 400 });
  }
```

- [ ] **Step 7: agent/logs/route.ts — accept CRYPTO**

Add `import { Market } from '@/lib/market';` to the imports. Change lines 9-12:

```typescript
  if (raw && raw !== 'MX' && raw !== 'USA') {
    return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  }
  const market = raw as 'MX' | 'USA' | null;
```

to:

```typescript
  if (raw && raw !== 'MX' && raw !== 'USA' && raw !== 'CRYPTO') {
    return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  }
  const market = raw as Market | null;
```

- [ ] **Step 8: pnl/route.ts — accept CRYPTO**

Change lines 9-11:

```typescript
  if (market !== 'MX' && market !== 'USA') {
    return NextResponse.json({ error: 'market must be "MX" or "USA"' }, { status: 400 });
  }
```

to:

```typescript
  if (market !== 'MX' && market !== 'USA' && market !== 'CRYPTO') {
    return NextResponse.json({ error: 'market must be "MX", "USA", or "CRYPTO"' }, { status: 400 });
  }
```

- [ ] **Step 9: trades/route.ts — widen the query param type**

Add `import { Market } from '@/lib/market';` to the imports. Change line 6 from `const market = searchParams.get('market') as 'MX' | 'USA' | null;` to `const market = searchParams.get('market') as Market | null;`.

- [ ] **Step 10: Verify the build and full test suite**

Run: `cd backend && npx tsc --noEmit && npx jest`
Expected: both exit 0 / PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/app/api/bot/config/route.ts backend/app/api/bot/start/route.ts \
        backend/app/api/bot/stop/route.ts backend/app/api/bot/status/route.ts \
        backend/app/api/agent/run/route.ts backend/app/api/agent/preview/route.ts \
        backend/app/api/agent/logs/route.ts backend/app/api/pnl/route.ts \
        backend/app/api/trades/route.ts
git commit -m "feat: widen API routes to accept the CRYPTO market"
```

---

### Task 13: Full regression verification

**Files:** none (verification only).

**Interfaces:** none — this task exercises everything built in Tasks 1-12.

- [ ] **Step 1: Full type check**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Full existing + new Jest suite**

Run: `cd backend && npx jest`
Expected: PASS, all suites — `ibkr.test.ts`, `ibkr-market-data.test.ts`, `indicators.test.ts`, `market-hours.test.ts`, `databursatil.test.ts` (all pre-existing, byte-for-byte unmodified except `market-hours.test.ts`'s Task 5 additions) plus `bitso.test.ts` and `crypto-indicators.test.ts` (new).

- [ ] **Step 3: MX/USA preview output diff (manual, requires a running dev server + authenticated IBKR gateway)**

This step needs a live, authenticated IBKR Client Portal gateway to execute (the same dependency every prior IBKR-touching manual test in this project has needed) — run it when a gateway session is available; it is not a blocker for merging Tasks 1-12 on its own, since Steps 1-2 already prove MX/USA code paths are byte-identical to before this plan.

```bash
# Before starting this plan's work (or from git stash / a clean checkout of
# the commit before Task 1), capture a baseline:
curl -s "http://localhost:3000/api/agent/preview?market=MX" > /tmp/mx-before.json
curl -s "http://localhost:3000/api/agent/preview?market=USA" > /tmp/usa-before.json

# After Task 12, with the dev server restarted:
curl -s "http://localhost:3000/api/agent/preview?market=MX" > /tmp/mx-after.json
curl -s "http://localhost:3000/api/agent/preview?market=USA" > /tmp/usa-after.json

diff /tmp/mx-before.json /tmp/mx-after.json
diff /tmp/usa-before.json /tmp/usa-after.json
```

Expected: no diff beyond fields that naturally change between two points in time (`lastPrice`, `changePct`, indicator values, timestamps) — the JSON *shape* (every key present, `currency: "MXN"` for MX / `"USD"` for USA, no new or missing fields) must be identical.

- [ ] **Step 4: Manual crypto smoke test (requires real BITSO_API_KEY/BITSO_API_SECRET in `.env.local`, ideally against `api-sandbox.bitso.com` first)**

```bash
# Create a CRYPTO BotConfig row with a curated symbol list:
curl -s -X POST http://localhost:3000/api/bot/config \
  -H 'Content-Type: application/json' \
  -d '{"market":"CRYPTO","symbols":["btc_mxn"],"capitalLimit":500,"intervalMin":15,"confidenceThreshold":0.65,"takeProfitPct":1.5,"stopLossPct":1.0,"feeEstimatePct":0.65}'

# Preview the exact request that would be sent to Claude for btc_mxn:
curl -s "http://localhost:3000/api/agent/preview?market=CRYPTO" | python3 -m json.tool
```

Expected: a 200 response whose `readable` block shows real BTC/MXN price data from Bitso and whose `request.system`/`request.messages[0].content` contain the crypto-specific prompt text from Task 7 — confirming the whole chain (BitsoClient → indicators → context builder → prompt) works end-to-end without ever calling `runAgentCycle`'s order-placing path.

- [ ] **Step 5: Final commit (if Steps 3-4 surfaced any fixes)**

```bash
git add -A
git commit -m "fix: address regression findings from crypto backend verification pass"
```

Only run this step if Steps 1-4 required a code change; otherwise Task 12's commit is the last one for this plan.

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-07-crypto-trading-bitso-design.md`'s 8 numbered sections):
1. `BitsoClient` shape → Tasks 2-3. ✅
2. `CryptoPriceSnapshot` model + bootstrap rationale → Task 1 (schema), Task 6 (accumulation logic, graceful `null` degradation before enough history exists — see `calculatePriceChangeSinceSnapshot`'s empty-array case). ✅
3. `crypto-indicators.ts` pure functions → Task 4 (the spec named `calculatePriceChange`/`calculateOrderBookImbalance`/`calculateSpreadPct`/`calculateRecentVolume`/`calculateCryptoIndicators`; this plan drops `calculateRecentVolume` as a distinct function because Bitso's ticker already reports 24h volume directly with no extra endpoint call needed — simpler, same information, YAGNI). ✅ (with one intentional, noted deviation)
4. `getCryptoMarketData()` → Task 6. ✅
5. Wiring into `claude-agent.ts` (three-way branches, new system prompt, indicators section, MXN currency, real fee schedule) → Tasks 7-10. The plan implements the "three-way branch" as a guard-clause dispatch to a wholly separate module rather than literal three-way `if/else if/else` branches inline in every function — a stricter, lower-diff mechanism for the same outcome, chosen specifically to strengthen the "don't affect MX/USA" constraint. ✅
6. Order execution dispatch + fractional-quantity clamping → Task 9 (`maxQuantity` computed without `Math.floor`, unlike MX/USA's whole-share clamping). ✅
7. Frontend additive-only pattern → **out of scope for this plan** (see Scope Check below).
8. Test files (`crypto-indicators.test.ts`, `bitso.test.ts`) + regression-suite requirement → Tasks 2-4, Task 13. ✅

**Scope Check:** the spec's Section 7 (frontend UI: new tab per page across Bot Config, Dashboard, Trade Log, Bot Logs, Agent Logs, PnL History) is a genuinely separate, independently-testable subsystem that depends on this plan's API surface existing first. Per the writing-plans skill's scope-check guidance, that work belongs in its own plan (`2026-07-0X-crypto-trading-bitso-frontend.md`), to be written once this backend plan is reviewed/underway — not bundled in here.

**Placeholder scan:** no `TBD`/`TODO`/"implement later"/"similar to Task N" found — every step has complete, copy-pasteable code or an exact shell command with expected output.

**Type consistency check:** `AgentCycleResult` (Task 9, defined in `crypto-agent.ts`) matches the field names/types of the existing `AgentCycleResult` in `claude-agent.ts` exactly (`action`, `quantity`, `confidence`, `reason`, `executed`) — required for `runAgentCycle`'s Task 10 dispatch (`if (market === 'CRYPTO') return runCryptoAgentCycle(symbol, config);`) to type-check against its own declared `Promise<AgentCycleResult>` return type. `CryptoAgentRequestPreview` (Task 8) is additively unioned into `previewAgentRequest`'s return type (Task 10) rather than replacing `AgentRequestPreview`, so existing MX/USA callers of `previewAgentRequest` keep getting the same shape back. `Market` (Task 1) is the single import used everywhere a market discriminator's type needed widening (Tasks 5, 10, 11, 12) — no file redeclares its own local union after Task 1.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-07-crypto-trading-bitso-backend.md`.** This covers the backend foundation (data, decisioning, execution) only — a follow-up plan for the frontend UI (Bot Config/Dashboard/log-pages tabs) should be written once this one is reviewed, since it depends on this plan's API surface.

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
