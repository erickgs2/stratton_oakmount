# Manual Trade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `canManualTrade`-permitted user place an immediate market-order buy/sell against any Bot-Config-eligible symbol in MX, USA, or CRYPTO, independent of the automated agent's caps.

**Architecture:** A new backend module (`lib/manual-trade.ts`) dispatches to a stock path (IBKR) or a crypto path (Bitso), validates against live funds/holdings and market hours, places the order, and records a `Trade` row tagged `source: 'manual'` with the placing user's email. One new route exposes it, gated by `canManualTrade`. The frontend gets a standalone `ManualTradeDialogComponent` opened from a button on each Dashboard market tab.

**Tech Stack:** Next.js 14 App Router (backend), Angular 17 + Angular Material (frontend), Prisma 7 + PostgreSQL, existing `ibkrClient`/`bitsoClient` singletons.

## Global Constraints

- Market orders only — no limit-order support (matches the automated agent).
- Symbol/coin choices are restricted to the existing `MX_SYMBOLS`/`USA_SYMBOLS`/`CRYPTO_SYMBOLS` lists — no free-text symbol search.
- Manual trades are exempt from the agent's 20%-per-symbol and `BotConfig.capitalLimit` caps, but are always blocked if they would exceed real available funds or held quantity.
- MX/USA manual trades are blocked outside that market's trading hours (reuse `isMarketOpen`); crypto trades 24/7.
- `Trade.action` values are lowercase `'buy'`/`'sell'` (confirmed from existing rows in `claude-agent.ts`/`crypto-agent.ts` — do not uppercase for the DB row; IBKR's own `side` param is the only place `'BUY'`/`'SELL'` uppercase is used).
- `placedByEmail` is read from the trusted `x-user-email` header (set by `middleware.ts`), never from the request body.
- Full spec: `docs/superpowers/specs/2026-07-10-manual-trade-design.md`.

---

### Task 1: Trade.placedByEmail migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_trade_placed_by_email/migration.sql`

**Interfaces:**
- Produces: `Trade.placedByEmail: string | null` — consumed by Task 2's `prisma.trade.create` calls.

- [ ] **Step 1: Add the field to the schema**

In `backend/prisma/schema.prisma`, find the `Trade` model and add `placedByEmail` right after `source`:

```prisma
model Trade {
  id            String   @id @default(cuid())
  symbol        String
  market        String
  action        String
  quantity      Float
  price         Float
  currency      String
  reason        String
  ibkrOrderId   String?
  source        String   @default("agent") // "agent" | "manual"
  placedByEmail String?  // set for source:"manual"; null for source:"agent"
  createdAt     DateTime @default(now())
}
```

- [ ] **Step 2: Generate and apply the migration**

```bash
cd backend
npx prisma migrate dev --name add_trade_placed_by_email
```

Expected: `The migration has been created and applied successfully.` and a new folder under `prisma/migrations/`.

**If this fails with a permission error** (this project's `master` DB role has previously lacked `ALTER` rights on existing tables — see project memory "Migration Drift Workaround"), fall back to the established workaround instead of retrying the same command:

```bash
npx prisma migrate dev --name add_trade_placed_by_email --create-only
```

This creates the migration folder without applying it. Open the generated `migration.sql` and confirm it contains exactly:

```sql
-- AlterTable
ALTER TABLE "Trade" ADD COLUMN "placedByEmail" TEXT;
```

Apply it directly as the `egarsev` role (which has `CREATE`/`ALTER` rights, unlike `master`):

```bash
psql -U egarsev -d stratton_oakmont -f prisma/migrations/<timestamp>_add_trade_placed_by_email/migration.sql
npx prisma migrate resolve --applied <timestamp>_add_trade_placed_by_email
```

- [ ] **Step 3: Verify migration status and regenerate the client**

```bash
npx prisma migrate status
npx prisma generate
```

Expected: `Database schema is up to date!`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Trade.placedByEmail for manual-trade attribution"
```

---

### Task 2: `lib/manual-trade.ts` — core order-placement logic

**Files:**
- Create: `backend/lib/manual-trade.ts`
- Test: `backend/__tests__/manual-trade.test.ts`

**Interfaces:**
- Consumes: `Market` (`@/lib/market`), `isMarketOpen` (`@/lib/market-hours`), `ibkrClient` (`@/lib/ibkr`) — `getPositions()`, `getAccountSummary()`, `searchConid(symbol, exchange)`, `placeOrder({conid, side, quantity, market})`; `bitsoClient` (`@/lib/bitso`) — `getTicker(book)`, `getBalances()`, `placeOrder({book, side, major})`; `getMXMarketData(symbol)` (`@/lib/databursatil`); `getUSAMarketData(symbol)` (`@/lib/ibkr-market-data`); `prisma` (`@/lib/prisma`).
- Produces: `executeManualTrade(params: ManualTradeParams): Promise<ManualTradeResult>` — consumed by Task 3's route.

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/manual-trade.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend
npx jest manual-trade.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/manual-trade'`

- [ ] **Step 3: Implement `backend/lib/manual-trade.ts`**

```typescript
import { Trade } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Market } from '@/lib/market';
import { isMarketOpen } from '@/lib/market-hours';
import { ibkrClient } from '@/lib/ibkr';
import { bitsoClient } from '@/lib/bitso';
import { getMXMarketData } from '@/lib/databursatil';
import { getUSAMarketData } from '@/lib/ibkr-market-data';

export interface ManualTradeParams {
  market: Market;
  symbol: string;
  side: 'buy' | 'sell';
  quantity?: number;   // required for MX/USA
  mxnAmount?: number;  // required for CRYPTO
  placedByEmail: string;
}

// `trade` is the full Prisma row (prisma.trade.create returns every
// column by default) — deliberately not narrowed to a few fields, since
// the frontend's ManualTradeService (Task 5) types its response as the
// full Trade model and a narrowed subset here would silently violate that.
export interface ManualTradeResult {
  success: boolean;
  trade?: Trade;
  error?: string;
  errorType?: 'validation' | 'broker_rejected';
}

export async function executeManualTrade(params: ManualTradeParams): Promise<ManualTradeResult> {
  if (params.market === 'CRYPTO') return executeCryptoManualTrade(params);
  return executeStockManualTrade(params);
}

async function executeStockManualTrade(params: ManualTradeParams): Promise<ManualTradeResult> {
  const { market, symbol, side, quantity, placedByEmail } = params;

  if (!isMarketOpen(market)) {
    return { success: false, error: `${market} market is closed`, errorType: 'validation' };
  }
  if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
    return { success: false, error: 'quantity must be a positive whole number of shares', errorType: 'validation' };
  }

  const positions = await ibkrClient.getPositions();
  const existingPosition = positions.find(p => p.ticker === symbol);

  if (side === 'sell') {
    const held = existingPosition?.position ?? 0;
    if (quantity > held) {
      return { success: false, error: `cannot sell ${quantity} shares — only ${held} held`, errorType: 'validation' };
    }
  }

  let conid = existingPosition?.conid;
  if (!conid) {
    const exchange = market === 'MX' ? 'BMV' : 'SMART';
    conid = (await ibkrClient.searchConid(symbol, exchange)) ?? undefined;
  }
  if (!conid) {
    return { success: false, error: `could not find a tradeable contract for ${symbol} on ${market}`, errorType: 'validation' };
  }

  const marketData = market === 'MX' ? await getMXMarketData(symbol) : await getUSAMarketData(symbol);
  const lastPrice = marketData.lastPrice;

  if (side === 'buy') {
    const summary = await ibkrClient.getAccountSummary();
    const estimatedCost = quantity * lastPrice;
    if (estimatedCost > summary.availableFunds) {
      return {
        success: false,
        error: `insufficient funds — need ~${estimatedCost.toFixed(2)}, have ${summary.availableFunds.toFixed(2)}`,
        errorType: 'validation',
      };
    }
  }

  const ibkrOrderId = await ibkrClient.placeOrder({
    conid, side: side === 'buy' ? 'BUY' : 'SELL', quantity, market: market as 'MX' | 'USA',
  });
  if (!ibkrOrderId) {
    return { success: false, error: 'IBKR rejected the order', errorType: 'broker_rejected' };
  }

  const trade = await prisma.trade.create({
    data: {
      symbol, market, action: side, quantity, price: lastPrice,
      currency: market === 'MX' ? 'MXN' : 'USD',
      reason: `Manual ${side} by ${placedByEmail}`,
      ibkrOrderId, source: 'manual', placedByEmail,
    },
  });

  return { success: true, trade };
}

async function executeCryptoManualTrade(params: ManualTradeParams): Promise<ManualTradeResult> {
  const { symbol, side, mxnAmount, placedByEmail } = params;

  if (!mxnAmount || mxnAmount <= 0) {
    return { success: false, error: 'amount must be a positive MXN amount', errorType: 'validation' };
  }

  const ticker = await bitsoClient.getTicker(symbol);
  const lastPrice = ticker.last;
  const coinQuantity = mxnAmount / lastPrice;

  const balances = await bitsoClient.getBalances();

  if (side === 'buy') {
    const mxnBalance = balances.find(b => b.currency === 'mxn')?.available ?? 0;
    if (mxnAmount > mxnBalance) {
      return {
        success: false,
        error: `insufficient MXN balance — need ${mxnAmount.toFixed(2)}, have ${mxnBalance.toFixed(2)}`,
        errorType: 'validation',
      };
    }
  } else {
    const baseCurrency = symbol.split('_')[0];
    const heldQuantity = balances.find(b => b.currency === baseCurrency)?.available ?? 0;
    if (coinQuantity > heldQuantity) {
      return {
        success: false,
        error: `insufficient ${baseCurrency.toUpperCase()} balance — need ${coinQuantity.toFixed(8)}, have ${heldQuantity.toFixed(8)}`,
        errorType: 'validation',
      };
    }
  }

  const orderId = await bitsoClient.placeOrder({ book: symbol, side, major: coinQuantity.toFixed(8) });
  if (!orderId) {
    return { success: false, error: 'Bitso rejected the order', errorType: 'broker_rejected' };
  }

  const trade = await prisma.trade.create({
    data: {
      symbol, market: 'CRYPTO', action: side, quantity: coinQuantity, price: lastPrice,
      currency: 'MXN',
      reason: `Manual ${side} by ${placedByEmail}`,
      // Trade.ibkrOrderId is a generically-named opaque order-id column,
      // already reused for Bitso order ids by crypto-agent.ts — same
      // convention here rather than adding a new column.
      ibkrOrderId: orderId, source: 'manual', placedByEmail,
    },
  });

  return { success: true, trade };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest manual-trade.test.ts
```

Expected: PASS, 11/11 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/manual-trade.ts __tests__/manual-trade.test.ts
git commit -m "feat: add executeManualTrade for MX/USA/CRYPTO manual order placement"
```

---

### Task 3: `POST /api/trades/manual` route

**Files:**
- Create: `backend/app/api/trades/manual/route.ts`
- Test: `backend/__tests__/manual-trade-route.test.ts`

**Interfaces:**
- Consumes: `executeManualTrade` (Task 2), `getAuthContext`/`requirePermission` (`@/lib/auth`).
- Produces: `POST /api/trades/manual` — consumed by Task 5's `ManualTradeService`.

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/manual-trade-route.test.ts`:

```typescript
jest.mock('@/lib/manual-trade', () => ({ executeManualTrade: jest.fn() }));

import { NextRequest } from 'next/server';
import { executeManualTrade } from '@/lib/manual-trade';
import { POST } from '../app/api/trades/manual/route';

function req(headers: Record<string, string>, body: unknown) {
  return new NextRequest('http://localhost/api/trades/manual', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

const DENIED_HEADERS = {
  'x-user-id': 'u1', 'x-user-email': 'a@b.com', 'x-can-edit-config': 'false', 'x-can-manual-trade': 'false',
};
const ALLOWED_HEADERS = {
  'x-user-id': 'u1', 'x-user-email': 'trader@example.com', 'x-can-edit-config': 'false', 'x-can-manual-trade': 'true',
};

beforeEach(() => jest.clearAllMocks());

describe('POST /api/trades/manual', () => {
  it('returns 403 without canManualTrade', async () => {
    const res = await POST(req(DENIED_HEADERS, { market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 10 }));
    expect(res.status).toBe(403);
    expect(executeManualTrade).not.toHaveBeenCalled();
  });

  it('passes placedByEmail from the trusted header, not the body, and returns the trade on success', async () => {
    (executeManualTrade as jest.Mock).mockResolvedValue({
      success: true, trade: { id: 't1', quantity: 10, price: 20 },
    });
    const res = await POST(req(ALLOWED_HEADERS, {
      market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 10, placedByEmail: 'attacker@evil.com',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trade).toEqual({ id: 't1', quantity: 10, price: 20 });
    expect(executeManualTrade).toHaveBeenCalledWith(
      expect.objectContaining({ placedByEmail: 'trader@example.com' }),
    );
  });

  it('returns 400 for a validation error', async () => {
    (executeManualTrade as jest.Mock).mockResolvedValue({
      success: false, error: 'MX market is closed', errorType: 'validation',
    });
    const res = await POST(req(ALLOWED_HEADERS, { market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 10 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('MX market is closed');
  });

  it('returns 502 for a broker rejection', async () => {
    (executeManualTrade as jest.Mock).mockResolvedValue({
      success: false, error: 'IBKR rejected the order', errorType: 'broker_rejected',
    });
    const res = await POST(req(ALLOWED_HEADERS, { market: 'MX', symbol: 'AMXL', side: 'sell', quantity: 1 }));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest manual-trade-route.test.ts
```

Expected: FAIL — route module not found.

- [ ] **Step 3: Implement `backend/app/api/trades/manual/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, requirePermission } from '@/lib/auth';
import { executeManualTrade } from '@/lib/manual-trade';
import { Market } from '@/lib/market';

export async function POST(request: NextRequest) {
  const context = getAuthContext(request);
  const denied = requirePermission(context, 'canManualTrade');
  if (denied) return denied;

  const body = await request.json() as {
    market?: Market;
    symbol?: string;
    side?: 'buy' | 'sell';
    quantity?: number;
    mxnAmount?: number;
  };

  if (!body.market || !body.symbol || (body.side !== 'buy' && body.side !== 'sell')) {
    return NextResponse.json({ error: 'market, symbol, and side ("buy"|"sell") are required' }, { status: 400 });
  }

  const result = await executeManualTrade({
    market: body.market,
    symbol: body.symbol,
    side: body.side,
    quantity: body.quantity,
    mxnAmount: body.mxnAmount,
    // requirePermission already returned above if context were null, so
    // this is guaranteed non-null here — TS can't see that control-flow
    // link across the two calls, hence the assertion.
    placedByEmail: context!.email,
  });

  if (!result.success) {
    const status = result.errorType === 'broker_rejected' ? 502 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ trade: result.trade });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest manual-trade-route.test.ts
```

Expected: PASS, 4/4 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/api/trades/manual/route.ts __tests__/manual-trade-route.test.ts
git commit -m "feat: add POST /api/trades/manual, gated by canManualTrade"
```

---

### Task 4: Frontend — shared symbol list extraction

**Files:**
- Create: `frontend/src/app/core/models/market-symbols.ts`
- Modify: `frontend/src/app/bot-config/bot-config.component.ts:22-24`

**Interfaces:**
- Produces: `MX_SYMBOLS`, `USA_SYMBOLS`, `CRYPTO_SYMBOLS` (raw arrays) and `symbolsForMarket(market: Market): string[]` — consumed by Task 6's `ManualTradeDialogComponent`.

- [ ] **Step 1: Create the shared file**

`frontend/src/app/core/models/market-symbols.ts`:

```typescript
import { Market } from './market.model';

export const MX_SYMBOLS = ['AMXL', 'FEMSAUBD', 'WALMEX', 'BIMBOA', 'GCARSOA1'];
export const USA_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'];
export const CRYPTO_SYMBOLS = ['btc_mxn', 'eth_mxn', 'usdc_mxn'];

export function symbolsForMarket(market: Market): string[] {
  if (market === 'MX') return MX_SYMBOLS;
  if (market === 'USA') return USA_SYMBOLS;
  return CRYPTO_SYMBOLS;
}
```

- [ ] **Step 2: Update `bot-config.component.ts` to import instead of defining locally**

In `frontend/src/app/bot-config/bot-config.component.ts`, replace:

```typescript
const MX_SYMBOLS = ['AMXL', 'FEMSAUBD', 'WALMEX', 'BIMBOA', 'GCARSOA1'];
const USA_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'];
const CRYPTO_SYMBOLS = ['btc_mxn', 'eth_mxn', 'usdc_mxn'];
```

with:

```typescript
import { MX_SYMBOLS, USA_SYMBOLS, CRYPTO_SYMBOLS } from '../core/models/market-symbols';
```

(placed alongside this file's other `import` statements at the top, not inline where the constants used to be — remove the three `const` lines entirely). No other line in this file changes; `mxSymbols = MX_SYMBOLS` etc. on the class body keep working unmodified since the imported names are identical.

- [ ] **Step 3: Typecheck**

```bash
cd frontend
npx tsc --noEmit -p tsconfig.app.json
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/models/market-symbols.ts src/app/bot-config/bot-config.component.ts
git commit -m "refactor: extract MX/USA/CRYPTO symbol lists to a shared file"
```

---

### Task 5: Frontend — `ManualTradeService` + widened `Trade` model

**Files:**
- Modify: `frontend/src/app/core/models/trade.model.ts`
- Create: `frontend/src/app/core/services/manual-trade.service.ts`
- Test: `frontend/src/app/core/services/manual-trade.service.spec.ts`

**Interfaces:**
- Produces: `ManualTradeService.execute(request: ManualTradeRequest): Observable<{ trade: Trade }>`, `ManualTradeRequest` — consumed by Task 6's `ManualTradeDialogComponent`.

- [ ] **Step 1: Widen the `Trade` model**

In `frontend/src/app/core/models/trade.model.ts`, add two optional fields:

```typescript
import { Market } from './market.model';

export interface Trade {
  id: string;
  symbol: string;
  market: Market;
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  price: number;
  currency: 'MXN' | 'USD';
  reason: string;
  ibkrOrderId?: string;
  source?: 'agent' | 'manual';
  placedByEmail?: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Write the failing test**

`frontend/src/app/core/services/manual-trade.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ManualTradeService } from './manual-trade.service';
import { environment } from '../../../environments/environment';

describe('ManualTradeService', () => {
  let service: ManualTradeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ManualTradeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('posts a stock trade request', () => {
    service.execute({ market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 10 }).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/trades/manual`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 10 });
    req.flush({ trade: { id: 't1', quantity: 10, price: 20 } });
  });

  it('posts a crypto trade request', () => {
    service.execute({ market: 'CRYPTO', symbol: 'btc_mxn', side: 'sell', mxnAmount: 500 }).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/trades/manual`);
    expect(req.request.body).toEqual({ market: 'CRYPTO', symbol: 'btc_mxn', side: 'sell', mxnAmount: 500 });
    req.flush({ trade: { id: 't2', quantity: 0.001, price: 500000 } });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd frontend
npx ng test --watch=false --include='**/manual-trade.service.spec.ts'
```

Expected: FAIL — `Cannot find module './manual-trade.service'`

- [ ] **Step 4: Implement `frontend/src/app/core/services/manual-trade.service.ts`**

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Market } from '../models/market.model';
import { Trade } from '../models/trade.model';

export interface ManualTradeRequest {
  market: Market;
  symbol: string;
  side: 'buy' | 'sell';
  quantity?: number;
  mxnAmount?: number;
}

@Injectable({ providedIn: 'root' })
export class ManualTradeService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  execute(request: ManualTradeRequest): Observable<{ trade: Trade }> {
    return this.http.post<{ trade: Trade }>(`${this.apiUrl}/trades/manual`, request);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx ng test --watch=false --include='**/manual-trade.service.spec.ts'
```

Expected: PASS, 2/2 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/models/trade.model.ts src/app/core/services/manual-trade.service.ts src/app/core/services/manual-trade.service.spec.ts
git commit -m "feat: add ManualTradeService, widen Trade model with source/placedByEmail"
```

---

### Task 6: Frontend — `ManualTradeDialogComponent`

**Files:**
- Create: `frontend/src/app/manual-trade/manual-trade-dialog.component.ts`
- Create: `frontend/src/app/manual-trade/manual-trade-dialog.component.html`
- Create: `frontend/src/app/manual-trade/manual-trade-dialog.component.scss`
- Test: `frontend/src/app/manual-trade/manual-trade-dialog.component.spec.ts`

**Interfaces:**
- Consumes: `symbolsForMarket` (Task 4), `ManualTradeService`/`ManualTradeRequest` (Task 5), `MarketDataService` (existing — `getMXData`/`getUSAData`/`getCryptoData(symbol): Observable<MXMarketData>`, `MXMarketData` has a `lastPrice: number` field).
- Produces: `ManualTradeDialogComponent`, `ManualTradeDialogData { market: Market; availableFunds: number; heldQuantities: Record<string, number> }` — consumed by Task 7's Dashboard integration. Dialog closes with `true` on a successful trade, `undefined` otherwise.

- [ ] **Step 1: Write the failing tests**

`frontend/src/app/manual-trade/manual-trade-dialog.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { ManualTradeDialogComponent, ManualTradeDialogData } from './manual-trade-dialog.component';
import { ManualTradeService } from '../core/services/manual-trade.service';
import { MarketDataService } from '../core/services/market-data.service';

describe('ManualTradeDialogComponent', () => {
  let component: ManualTradeDialogComponent;
  let fixture: ComponentFixture<ManualTradeDialogComponent>;
  let dialogRefStub: { close: jasmine.Spy };
  let manualTradeServiceStub: { execute: jasmine.Spy };
  let marketDataServiceStub: { getMXData: jasmine.Spy; getUSAData: jasmine.Spy; getCryptoData: jasmine.Spy };

  function setup(data: ManualTradeDialogData): void {
    dialogRefStub = { close: jasmine.createSpy('close') };
    manualTradeServiceStub = { execute: jasmine.createSpy('execute') };
    marketDataServiceStub = {
      getMXData: jasmine.createSpy('getMXData').and.returnValue(of({ symbol: 'AMXL', lastPrice: 20, changePct: 0, volume: 0, history: [] })),
      getUSAData: jasmine.createSpy('getUSAData').and.returnValue(of({ symbol: 'AAPL', lastPrice: 100, changePct: 0, volume: 0, history: [] })),
      getCryptoData: jasmine.createSpy('getCryptoData').and.returnValue(of({ symbol: 'btc_mxn', lastPrice: 1000000, changePct: 0, volume: 0, history: [] })),
    };

    TestBed.configureTestingModule({
      imports: [ManualTradeDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefStub },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: ManualTradeService, useValue: manualTradeServiceStub },
        { provide: MarketDataService, useValue: marketDataServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManualTradeDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('defaults to the first eligible symbol for the market and fetches its price', () => {
    setup({ market: 'MX', availableFunds: 10000, heldQuantities: {} });
    expect(component.symbol).toBe('AMXL');
    expect(marketDataServiceStub.getMXData).toHaveBeenCalledWith('AMXL');
    expect(component.livePrice).toBe(20);
  });

  it('uses the crypto market-data endpoint for a CRYPTO dialog', () => {
    setup({ market: 'CRYPTO', availableFunds: 5000, heldQuantities: {} });
    expect(component.symbol).toBe('btc_mxn');
    expect(marketDataServiceStub.getCryptoData).toHaveBeenCalledWith('btc_mxn');
  });

  it('moves to the confirm step with a valid MX/USA quantity', () => {
    setup({ market: 'MX', availableFunds: 10000, heldQuantities: {} });
    component.quantity = 5;
    component.reviewOrder();
    expect(component.step).toBe('confirm');
    expect(component.errorMessage).toBe('');
  });

  it('rejects reviewing an MX/USA order with no quantity entered', () => {
    setup({ market: 'MX', availableFunds: 10000, heldQuantities: {} });
    component.quantity = null;
    component.reviewOrder();
    expect(component.step).toBe('form');
    expect(component.errorMessage).not.toBe('');
  });

  it('moves to the confirm step with a valid CRYPTO amount', () => {
    setup({ market: 'CRYPTO', availableFunds: 5000, heldQuantities: {} });
    component.mxnAmount = 500;
    component.reviewOrder();
    expect(component.step).toBe('confirm');
  });

  it('confirmOrder calls the service and closes the dialog with true on success', () => {
    setup({ market: 'MX', availableFunds: 10000, heldQuantities: {} });
    manualTradeServiceStub.execute.and.returnValue(of({ trade: { id: 't1', quantity: 5, price: 20 } }));
    component.quantity = 5;
    component.reviewOrder();
    component.confirmOrder();
    expect(manualTradeServiceStub.execute).toHaveBeenCalledWith({ market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 5 });
    expect(dialogRefStub.close).toHaveBeenCalledWith(true);
  });

  it('confirmOrder surfaces a backend error and stays on the confirm step', () => {
    setup({ market: 'MX', availableFunds: 10000, heldQuantities: {} });
    manualTradeServiceStub.execute.and.returnValue(throwError(() => ({ error: { error: 'MX market is closed' } })));
    component.quantity = 5;
    component.reviewOrder();
    component.confirmOrder();
    expect(component.errorMessage).toBe('MX market is closed');
    expect(component.step).toBe('confirm');
    expect(dialogRefStub.close).not.toHaveBeenCalled();
  });

  it('back() returns to the form step', () => {
    setup({ market: 'MX', availableFunds: 10000, heldQuantities: {} });
    component.quantity = 5;
    component.reviewOrder();
    component.back();
    expect(component.step).toBe('form');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng test --watch=false --include='**/manual-trade-dialog.component.spec.ts'
```

Expected: FAIL — `Cannot find module './manual-trade-dialog.component'`

- [ ] **Step 3: Implement `frontend/src/app/manual-trade/manual-trade-dialog.component.ts`**

```typescript
import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { Market } from '../core/models/market.model';
import { symbolsForMarket } from '../core/models/market-symbols';
import { ManualTradeService } from '../core/services/manual-trade.service';
import { MarketDataService } from '../core/services/market-data.service';

export interface ManualTradeDialogData {
  market: Market;
  availableFunds: number;
  heldQuantities: Record<string, number>;
}

@Component({
  selector: 'app-manual-trade-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonToggleModule,
    MatFormFieldModule, MatSelectModule, MatInputModule, MatButtonModule,
  ],
  templateUrl: './manual-trade-dialog.component.html',
  styleUrl: './manual-trade-dialog.component.scss',
})
export class ManualTradeDialogComponent implements OnInit {
  step: 'form' | 'confirm' = 'form';
  side: 'buy' | 'sell' = 'buy';
  symbol: string;
  quantity: number | null = null;
  mxnAmount: number | null = null;
  livePrice: number | null = null;
  loadingPrice = false;
  submitting = false;
  errorMessage = '';

  readonly symbols: string[];
  readonly isCrypto: boolean;

  constructor(
    private dialogRef: MatDialogRef<ManualTradeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ManualTradeDialogData,
    private manualTradeService: ManualTradeService,
    private marketDataService: MarketDataService,
  ) {
    this.symbols = symbolsForMarket(data.market);
    this.isCrypto = data.market === 'CRYPTO';
    this.symbol = this.symbols[0];
  }

  ngOnInit(): void {
    this.fetchPrice();
  }

  onSymbolChange(): void {
    this.fetchPrice();
  }

  private fetchPrice(): void {
    this.loadingPrice = true;
    this.livePrice = null;
    const source$ =
      this.data.market === 'MX' ? this.marketDataService.getMXData(this.symbol) :
      this.data.market === 'USA' ? this.marketDataService.getUSAData(this.symbol) :
      this.marketDataService.getCryptoData(this.symbol);

    source$.subscribe({
      next: data => { this.livePrice = data.lastPrice; this.loadingPrice = false; },
      error: () => { this.loadingPrice = false; },
    });
  }

  get heldQuantity(): number {
    return this.data.heldQuantities[this.symbol] ?? 0;
  }

  get estimatedTotal(): number {
    if (this.isCrypto) return this.mxnAmount ?? 0;
    return (this.quantity ?? 0) * (this.livePrice ?? 0);
  }

  reviewOrder(): void {
    this.errorMessage = '';
    if (this.isCrypto) {
      if (!this.mxnAmount || this.mxnAmount <= 0) {
        this.errorMessage = 'Enter a valid MXN amount';
        return;
      }
    } else {
      if (!this.quantity || this.quantity <= 0 || !Number.isInteger(this.quantity)) {
        this.errorMessage = 'Enter a valid whole number of shares';
        return;
      }
    }
    this.step = 'confirm';
  }

  back(): void {
    this.step = 'form';
  }

  confirmOrder(): void {
    this.submitting = true;
    this.errorMessage = '';
    this.manualTradeService.execute({
      market: this.data.market,
      symbol: this.symbol,
      side: this.side,
      ...(this.isCrypto ? { mxnAmount: this.mxnAmount ?? undefined } : { quantity: this.quantity ?? undefined }),
    }).subscribe({
      next: () => {
        this.submitting = false;
        this.dialogRef.close(true);
      },
      error: err => {
        this.submitting = false;
        this.errorMessage = err?.error?.error ?? 'Failed to place order, please try again';
      },
    });
  }
}
```

- [ ] **Step 4: Implement `frontend/src/app/manual-trade/manual-trade-dialog.component.html`**

```html
<h2 mat-dialog-title>Manual Trade — {{ data.market }}</h2>

<mat-dialog-content>
  <ng-container *ngIf="step === 'form'">
    <mat-button-toggle-group [(ngModel)]="side" name="side" class="side-toggle">
      <mat-button-toggle value="buy">Buy</mat-button-toggle>
      <mat-button-toggle value="sell">Sell</mat-button-toggle>
    </mat-button-toggle-group>

    <mat-form-field appearance="outline" class="full-width">
      <mat-label>Symbol</mat-label>
      <mat-select [(ngModel)]="symbol" (selectionChange)="onSymbolChange()">
        <mat-option *ngFor="let s of symbols" [value]="s">{{ s }}</mat-option>
      </mat-select>
    </mat-form-field>

    <p class="price-line">
      <ng-container *ngIf="loadingPrice">Loading price…</ng-container>
      <ng-container *ngIf="!loadingPrice && livePrice !== null">Current price: {{ livePrice | number:'1.2-2' }}</ng-container>
    </p>

    <p class="hint-line">
      <ng-container *ngIf="side === 'buy'">Available funds: {{ data.availableFunds | number:'1.2-2' }}</ng-container>
      <ng-container *ngIf="side === 'sell'">Currently held: {{ heldQuantity }}</ng-container>
    </p>

    <mat-form-field *ngIf="!isCrypto" appearance="outline" class="full-width">
      <mat-label>Quantity (shares)</mat-label>
      <input matInput type="number" [(ngModel)]="quantity" min="1" step="1">
    </mat-form-field>

    <mat-form-field *ngIf="isCrypto" appearance="outline" class="full-width">
      <mat-label>Amount (MXN)</mat-label>
      <input matInput type="number" [(ngModel)]="mxnAmount" min="0.01" step="0.01">
    </mat-form-field>

    <p class="error-message" *ngIf="errorMessage">{{ errorMessage }}</p>
  </ng-container>

  <ng-container *ngIf="step === 'confirm'">
    <p><strong>{{ side === 'buy' ? 'Buy' : 'Sell' }}</strong> {{ symbol }}</p>
    <p *ngIf="!isCrypto">Quantity: {{ quantity }} shares</p>
    <p *ngIf="isCrypto">Amount: {{ mxnAmount | number:'1.2-2' }} MXN</p>
    <p>Estimated price: {{ livePrice | number:'1.2-2' }}</p>
    <p>Estimated total: {{ estimatedTotal | number:'1.2-2' }}</p>

    <p class="error-message" *ngIf="errorMessage">{{ errorMessage }}</p>
  </ng-container>
</mat-dialog-content>

<mat-dialog-actions>
  <ng-container *ngIf="step === 'form'">
    <button mat-button mat-dialog-close>Cancel</button>
    <button mat-raised-button color="primary" (click)="reviewOrder()">Review</button>
  </ng-container>
  <ng-container *ngIf="step === 'confirm'">
    <button mat-button (click)="back()" [disabled]="submitting">Back</button>
    <button mat-raised-button color="primary" (click)="confirmOrder()" [disabled]="submitting">Confirm &amp; Place Order</button>
  </ng-container>
</mat-dialog-actions>
```

- [ ] **Step 5: Implement `frontend/src/app/manual-trade/manual-trade-dialog.component.scss`**

```scss
.side-toggle {
  display: flex;
  margin-bottom: 16px;
}

.full-width {
  width: 100%;
}

.price-line, .hint-line {
  margin: 4px 0;
  font-size: 0.9rem;
  color: var(--text-muted, #666);
}

.error-message {
  color: var(--mat-sys-error, #d32f2f);
  margin-top: 8px;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx ng test --watch=false --include='**/manual-trade-dialog.component.spec.ts'
```

Expected: PASS, 8/8 tests green.

- [ ] **Step 7: Commit**

```bash
git add src/app/manual-trade
git commit -m "feat: add ManualTradeDialogComponent"
```

---

### Task 7: Dashboard integration

**Files:**
- Modify: `frontend/src/app/dashboard/dashboard.component.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.html`
- Test: `frontend/src/app/dashboard/dashboard.component.spec.ts` (new — none exists yet)

**Interfaces:**
- Consumes: `ManualTradeDialogComponent`/`ManualTradeDialogData` (Task 6), `AuthService.hasPermission` (existing, from the auth plan).

- [ ] **Step 1: Add imports, `MatDialog`/`AuthService` injection, and the dialog-opening/refresh methods**

In `frontend/src/app/dashboard/dashboard.component.ts`, add to the existing imports at the top:

```typescript
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { AuthService } from '../core/services/auth.service';
import { ManualTradeDialogComponent, ManualTradeDialogData } from '../manual-trade/manual-trade-dialog.component';
```

Add `MatDialogModule` to the `@Component` decorator's `imports` array (alongside the existing `MatTabsModule, MatCardModule, ...` list — do not remove or reorder any existing entry).

Add two new constructor parameters (append to the existing parameter list, do not reorder the existing ones):

```typescript
private dialog: MatDialog,
private authService: AuthService,
```

Add these methods to the class body (alongside the existing `toggleBot`/`get currency` methods):

```typescript
hasPermission(permission: 'canEditConfig' | 'canManualTrade'): boolean {
  return this.authService.hasPermission(permission);
}

openManualTradeDialog(market: Market): void {
  const availableFunds = market === 'CRYPTO'
    ? this.cryptoPortfolio?.availableFunds ?? 0
    : this.portfolio?.summary.availableFunds ?? 0;
  const heldQuantities: Record<string, number> = market === 'CRYPTO'
    ? Object.fromEntries((this.cryptoPortfolio?.positions ?? []).map(p => [p.book, p.quantity]))
    : Object.fromEntries((this.portfolio?.positions ?? []).map(p => [p.ticker, p.position]));

  const dialogRef = this.dialog.open(ManualTradeDialogComponent, {
    width: '90vw',
    maxWidth: '480px',
    data: { market, availableFunds, heldQuantities } as ManualTradeDialogData,
  });

  dialogRef.afterClosed().subscribe(result => {
    if (result) this.refreshPortfolio();
  });
}

private refreshPortfolio(): void {
  this.subs.add(
    this.portfolioService.getPortfolio().subscribe(p => {
      this.portfolio = p;
      this.portfolioUpdatedAt = new Date();
    })
  );
  this.subs.add(
    this.cryptoPortfolioService.getPortfolio().subscribe(p => { this.cryptoPortfolio = p; })
  );
}
```

- [ ] **Step 2: Add the Manual Trade button to both dashboard templates**

In `frontend/src/app/dashboard/dashboard.component.html`, inside `#marketContent` (shared by the MX and USA tabs), find this exact block:

```html
    <ng-template #marketClosed>
      <mat-icon class="status-icon closed">wifi_off</mat-icon>
      <span>Market closed · portfolio updates paused
        <ng-container *ngIf="portfolioUpdatedAt"> · snapshot at {{ portfolioUpdatedAt | date:'HH:mm' }}</ng-container>
      </span>
    </ng-template>
  </div>

  <div *ngIf="!loading && !error && portfolio" class="cards-row">
```

Insert the button between the two, so it reads:

```html
    <ng-template #marketClosed>
      <mat-icon class="status-icon closed">wifi_off</mat-icon>
      <span>Market closed · portfolio updates paused
        <ng-container *ngIf="portfolioUpdatedAt"> · snapshot at {{ portfolioUpdatedAt | date:'HH:mm' }}</ng-container>
      </span>
    </ng-template>
  </div>

  <button mat-raised-button color="primary" class="manual-trade-btn"
          *ngIf="hasPermission('canManualTrade')"
          (click)="openManualTradeDialog(activeMarket)">
    Manual Trade
  </button>

  <div *ngIf="!loading && !error && portfolio" class="cards-row">
```

In the same file, inside `#cryptoContent`, find this exact block:

```html
  <div *ngIf="!cryptoLoading && !cryptoError" class="portfolio-status">
    <mat-icon class="status-icon open">wifi</mat-icon>
    <span>Live · updating every 30s · crypto trades 24/7, no market hours</span>
  </div>

  <div *ngIf="!cryptoLoading && !cryptoError && cryptoPortfolio" class="cards-row">
```

Insert the equivalent button:

```html
  <div *ngIf="!cryptoLoading && !cryptoError" class="portfolio-status">
    <mat-icon class="status-icon open">wifi</mat-icon>
    <span>Live · updating every 30s · crypto trades 24/7, no market hours</span>
  </div>

  <button mat-raised-button color="primary" class="manual-trade-btn"
          *ngIf="hasPermission('canManualTrade')"
          (click)="openManualTradeDialog('CRYPTO')">
    Manual Trade
  </button>

  <div *ngIf="!cryptoLoading && !cryptoError && cryptoPortfolio" class="cards-row">
```

No other markup in this file changes.

- [ ] **Step 3: Write `frontend/src/app/dashboard/dashboard.component.spec.ts`**

No spec file exists yet for this component. Create one with focused coverage of the new permission-gated button (not a full re-test of Dashboard's pre-existing polling/portfolio logic, which is out of this task's scope):

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { PortfolioService } from '../core/services/portfolio.service';
import { BotService } from '../core/services/bot.service';
import { OrderService } from '../core/services/order.service';
import { PnlService } from '../core/services/pnl.service';
import { CryptoPortfolioService } from '../core/services/crypto-portfolio.service';
import { AuthService } from '../core/services/auth.service';

describe('DashboardComponent — Manual Trade button', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let authServiceStub: { hasPermission: jasmine.Spy };

  function setup(canManualTrade: boolean): void {
    authServiceStub = { hasPermission: jasmine.createSpy('hasPermission').and.returnValue(canManualTrade) };

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: PortfolioService, useValue: { getPortfolio: () => of({ positions: [], summary: { availableFunds: 0, buyingPower: 0, currency: 'USD', totalCashValue: 0, netLiquidation: 0 } }) } },
        { provide: BotService, useValue: { getStatus: () => of({ configs: [], markets: { MX: false, USA: false, CRYPTO: false } }) } },
        { provide: OrderService, useValue: { getPendingOrders: () => of([]) } },
        { provide: PnlService, useValue: { getReport: () => of(null) } },
        { provide: CryptoPortfolioService, useValue: { getPortfolio: () => of({ currency: 'MXN', availableFunds: 0, netLiquidation: 0, positions: [] }) } },
        { provide: AuthService, useValue: authServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  }

  it('hides the Manual Trade button without canManualTrade', () => {
    setup(false);
    const btn = fixture.nativeElement.querySelector('.manual-trade-btn');
    expect(btn).toBeNull();
  });

  it('shows the Manual Trade button with canManualTrade', () => {
    setup(true);
    const btn = fixture.nativeElement.querySelector('.manual-trade-btn');
    expect(btn).not.toBeNull();
  });
});
```

- [ ] **Step 4: Run the new test**

```bash
cd frontend
npx ng test --watch=false --include='**/dashboard.component.spec.ts'
```

Expected: PASS, 2/2 tests green. `TabPersistenceService` is `providedIn: 'root'` and only wraps `localStorage` (confirmed in `frontend/src/app/core/services/tab-persistence.service.ts`) — no stub needed for it in the providers list above.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/dashboard.component.ts src/app/dashboard/dashboard.component.html src/app/dashboard/dashboard.component.spec.ts
git commit -m "feat: add Manual Trade button to Dashboard's MX/USA/CRYPTO tabs"
```

---

### Task 8: Final consolidated verification

**Files:** none — verification only, per this project's established preference for one full-suite pass at the end rather than after every task.

- [ ] **Step 1: Backend verification**

```bash
cd backend
npx tsc --noEmit
npx eslint .
npx jest
```

Expected: `tsc`/`eslint` clean; `jest` all-green except the 2 pre-existing, unrelated `databursatil.test.ts` failures documented throughout this project's history (confirm via `git diff --stat` that `databursatil.ts`/`databursatil.test.ts` are untouched by this branch before treating any failure there as pre-existing).

- [ ] **Step 2: Frontend verification**

```bash
cd frontend
npx tsc --noEmit -p tsconfig.app.json
npx ng build --configuration development
npx ng test --watch=false
```

Expected: `tsc`/build clean; `ng test` all-green except the 2 pre-existing, unrelated `styles.spec.ts` viewport-width failures (same confirmation approach — check `git diff --stat` before attributing any failure to a pre-existing gap).

- [ ] **Step 3: Live smoke test**

Start both servers (`cd backend && npm run dev`, `cd frontend && npx ng serve`), log in as a user with `canManualTrade: true`, and verify:
- The Manual Trade button appears on the Dashboard's MX, USA, and CRYPTO tabs.
- Opening it shows the correct default symbol and a live price.
- Submitting a trade with an amount exceeding available funds/holdings shows a clear inline error and does not close the dialog.
- A user without `canManualTrade` does not see the button on any tab.
- Directly `curl -X POST http://localhost:3000/api/trades/manual` with a token lacking `canManualTrade` returns `403`.

Note any deviations before considering this plan complete.

- [ ] **Step 4: Report results**

Summarize pass/fail status for each step above; do not mark the plan complete if any non-pre-existing test fails or the smoke test surfaces a real defect.
