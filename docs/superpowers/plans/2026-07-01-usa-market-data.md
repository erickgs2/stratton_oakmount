# USA Market Data (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the USA market data stub with a real IBKR-backed implementation, enabling the Claude trading agent to run for NYSE/Nasdaq symbols so MX and USA can trade concurrently.

**Architecture:** Two new `IBKRClient` methods (`getMarketDataSnapshot`, `getMarketDataHistory`) call IBKR's own Client Portal Web API for quotes and 60-day history. A new `getUSAMarketData()` function composes them (plus the already-existing `searchConid` for ticker→conid resolution, with a simple in-memory cache) into the exact same shape MX's `getMXMarketData()` already returns, so every downstream consumer (Claude agent, indicator calculations, dashboard) needs zero market-specific branching beyond the one call-site swap.

**Tech Stack:** Next.js 14 API routes, TypeScript strict mode, Jest, IBKR Client Portal Web API.

## Global Constraints

- All code, naming, and docs in English.
- TypeScript strict mode throughout.
- USA market data comes exclusively from IBKR's own API — no third-party provider (Alpha Vantage, Polygon, etc.).
- USA uses the same defaults as MX (confidence threshold 0.65, 15-minute interval) — no extra risk gating for this initial implementation.
- `getUSAMarketData()` must return the exact `MXMarketData` shape (`{ symbol, lastPrice, changePct, volume, history: { date, close, volume }[] }`), imported and reused as-is from `backend/lib/databursatil.ts` — not duplicated or renamed.
- Snapshot field IDs (verified against IBKR's own API spec): `31` = Last Price, `83` = Change %, `87` = Volume.

---

### Task 1: `IBKRClient.getMarketDataSnapshot` + `getMarketDataHistory`

**Files:**
- Modify: `backend/lib/ibkr.ts`
- Test: `backend/__tests__/ibkr.test.ts`

**Interfaces:**
- Produces: `ibkrClient.getMarketDataSnapshot(conid: number): Promise<{ lastPrice: number; changePct: number; volume: number } | null>` — used by Task 2.
- Produces: `ibkrClient.getMarketDataHistory(conid: number): Promise<{ date: string; close: number; volume: number }[]>` — used by Task 2.

- [ ] **Step 1: Write the failing tests**

In `backend/__tests__/ibkr.test.ts`, add two new `describe` blocks at the end of the outer `describe('IBKRClient', ...)`, before the final closing brace. These use `jest.useFakeTimers()` (matching the existing `keep-alive`/`checkAuthStatus` test style in this file) since the retry logic waits between attempts:

```typescript
  describe('getMarketDataSnapshot', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('parses fields 31/83/87 from a complete response', async () => {
      mockHttpsResponse(200, [{ conid: 265598, '31': '168.42', '83': '1.25', '87': '1300' }]);

      const result = await client.getMarketDataSnapshot(265598);

      expect(result).toEqual({ lastPrice: 168.42, changePct: 1.25, volume: 1300 });
    });

    it('retries when the first response is incomplete, succeeds on a later attempt', async () => {
      const mockReq = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
      let call = 0;
      (https.request as jest.Mock).mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        call++;
        const body = call === 1
          ? [{ conid: 265598 }] // incomplete — fields not populated yet
          : [{ conid: 265598, '31': '168.42', '83': '1.25', '87': '1300' }];
        const res = {
          statusCode: 200,
          on: jest.fn((event: string, cb: (data?: string) => void) => {
            if (event === 'data') cb(JSON.stringify(body));
            if (event === 'end') cb();
          }),
        };
        callback(res);
        return mockReq;
      });

      const promise = client.getMarketDataSnapshot(265598);
      await jest.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(result).toEqual({ lastPrice: 168.42, changePct: 1.25, volume: 1300 });
      expect(https.request).toHaveBeenCalledTimes(2);
    });

    it('returns null after exhausting retries with still-incomplete data', async () => {
      mockHttpsResponse(200, [{ conid: 265598 }]); // never completes

      const promise = client.getMarketDataSnapshot(265598);
      await jest.advanceTimersByTimeAsync(1500); // covers all retry delays
      const result = await promise;

      expect(result).toBeNull();
      expect(https.request).toHaveBeenCalledTimes(3);
    });
  });

  describe('getMarketDataHistory', () => {
    it('maps the data array to { date, close, volume }, sorted ascending', async () => {
      mockHttpsResponse(200, {
        data: [
          { t: 1719792000000, o: 10, h: 11, l: 9, c: 10.5, v: 500000 }, // 2024-07-01
          { t: 1719705600000, o: 9, h: 10, l: 8, c: 9.5, v: 400000 },   // 2024-06-30
        ],
      });

      const history = await client.getMarketDataHistory(265598);

      expect(history).toEqual([
        { date: '2024-06-30', close: 9.5, volume: 400000 },
        { date: '2024-07-01', close: 10.5, volume: 500000 },
      ]);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest __tests__/ibkr.test.ts -t "getMarketDataSnapshot|getMarketDataHistory"`
Expected: FAIL — `client.getMarketDataSnapshot is not a function`, `client.getMarketDataHistory is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `backend/lib/ibkr.ts`, add both methods after `getAccountSummary()` (before `searchConid`):

```typescript
  async getMarketDataSnapshot(conid: number): Promise<{ lastPrice: number; changePct: number; volume: number } | null> {
    type SnapshotEntry = { conid: number; '31'?: string; '83'?: string; '87'?: string };

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const results = await this.request<SnapshotEntry[]>(
        `/iserver/marketdata/snapshot?conids=${conid}&fields=31,83,87`
      );
      const entry = results?.[0];

      if (entry && entry['31'] != null && entry['83'] != null && entry['87'] != null) {
        return {
          lastPrice: parseFloat(entry['31']),
          changePct: parseFloat(entry['83']),
          volume: parseFloat(entry['87']),
        };
      }
    }

    return null;
  }

  async getMarketDataHistory(conid: number): Promise<{ date: string; close: number; volume: number }[]> {
    type HistoryResponse = { data?: Array<{ t: number; c: number; v: number }> };

    const result = await this.request<HistoryResponse>(
      `/iserver/marketdata/history?conid=${conid}&period=60d&bar=1d`
    );

    return (result.data ?? [])
      .map(bar => ({
        date: new Date(bar.t).toISOString().split('T')[0],
        close: bar.c,
        volume: bar.v,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest __tests__/ibkr.test.ts`
Expected: PASS (all tests, including the 4 new ones — 21 total).

- [ ] **Step 5: Commit**

```bash
git add backend/lib/ibkr.ts backend/__tests__/ibkr.test.ts
git commit -m "feat: add IBKR market data snapshot and history methods"
```

---

### Task 2: `getUSAMarketData` with conid caching

**Files:**
- Create: `backend/lib/ibkr-market-data.ts`
- Test: `backend/__tests__/ibkr-market-data.test.ts`

**Interfaces:**
- Consumes: `ibkrClient.searchConid(symbol: string, exchange: string): Promise<number | null>` (existing, unchanged), `ibkrClient.getMarketDataSnapshot(conid: number)` and `ibkrClient.getMarketDataHistory(conid: number)` (Task 1).
- Produces: `getUSAMarketData(symbol: string): Promise<MXMarketData>` — used by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/ibkr-market-data.test.ts`:

```typescript
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
    (ibkrClient.searchConid as jest.Mock).mockResolvedValue(265598);
    (ibkrClient.getMarketDataSnapshot as jest.Mock).mockResolvedValue({
      lastPrice: 168.42, changePct: 1.25, volume: 1300,
    });
    (ibkrClient.getMarketDataHistory as jest.Mock).mockResolvedValue([]);

    await getUSAMarketData('AAPL');
    await getUSAMarketData('AAPL');

    expect(ibkrClient.searchConid).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest __tests__/ibkr-market-data.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ibkr-market-data'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/lib/ibkr-market-data.ts`:

```typescript
import { ibkrClient } from './ibkr';
import { MXMarketData } from './databursatil';

const conidCache = new Map<string, number>();

async function resolveConid(symbol: string): Promise<number> {
  const cached = conidCache.get(symbol);
  if (cached !== undefined) return cached;

  const conid = await ibkrClient.searchConid(symbol, 'SMART');
  if (conid === null) {
    throw new Error(`No conid found for symbol ${symbol}`);
  }

  conidCache.set(symbol, conid);
  return conid;
}

export async function getUSAMarketData(symbol: string): Promise<MXMarketData> {
  const conid = await resolveConid(symbol);

  const [snapshot, history] = await Promise.all([
    ibkrClient.getMarketDataSnapshot(conid),
    ibkrClient.getMarketDataHistory(conid),
  ]);

  if (!snapshot) {
    throw new Error(`No quote data returned for symbol ${symbol}`);
  }

  return {
    symbol,
    lastPrice: snapshot.lastPrice,
    changePct: snapshot.changePct,
    volume: snapshot.volume,
    history,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest __tests__/ibkr-market-data.test.ts`
Expected: PASS (4/4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/lib/ibkr-market-data.ts backend/__tests__/ibkr-market-data.test.ts
git commit -m "feat: add getUSAMarketData with cached conid resolution"
```

---

### Task 3: Wire into the API route and Claude agent

**Files:**
- Modify: `backend/app/api/market-data/usa/route.ts`
- Modify: `backend/lib/claude-agent.ts`
- Modify: `frontend/src/app/bot-config/bot-config.component.html`

**Interfaces:**
- Consumes: `getUSAMarketData(symbol: string): Promise<MXMarketData>` (Task 2).

No new automated tests for this task — both files are thin call-site swaps into already-tested code (`getUSAMarketData` itself is tested in Task 2; `claude-agent.ts`'s surrounding logic and `market-data/mx/route.ts`'s pattern are pre-existing and untested per this codebase's convention of not adding route-level tests). Verified manually in Step 4.

- [ ] **Step 1: Replace the USA market data route stub**

Replace the entire contents of `backend/app/api/market-data/usa/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getUSAMarketData } from '@/lib/ibkr-market-data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'symbol query param is required' }, { status: 400 });
  }

  try {
    const data = await getUSAMarketData(symbol);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
```

(This is byte-for-byte the same pattern as `backend/app/api/market-data/mx/route.ts`, just calling `getUSAMarketData` instead of `getMXMarketData`.)

- [ ] **Step 2: Wire the Claude agent's USA branch**

In `backend/lib/claude-agent.ts`, add the import alongside the existing `getMXMarketData` import (line 2):

```typescript
import { getMXMarketData } from '@/lib/databursatil';
import { getUSAMarketData } from '@/lib/ibkr-market-data';
```

Then replace the `else` branch (lines 189-191):

```typescript
  } else {
    throw new Error('USA market data not yet implemented — set ACTIVE_MARKET=MX for Phase 1');
  }
```

with:

```typescript
  } else {
    const data = await getUSAMarketData(symbol);
    lastPrice   = data.lastPrice;
    changePct   = data.changePct;
    volume      = data.volume;
    closePrices = data.history.map(h => h.close);
    volumes     = data.history.map(h => h.volume);
  }
```

- [ ] **Step 3: Remove the stale "Phase 2 not implemented" banner**

In `frontend/src/app/bot-config/bot-config.component.html`, find and remove the banner referencing `ACTIVE_MARKET=USA` / "Phase 2" (it's inside the USA tab section, near the top). Read the file first to find its exact current location and surrounding markup before removing it — do not remove any other content in that tab (the symbol chips, capital limit field, etc. must stay).

- [ ] **Step 4: Verify — build and manual check**

Run: `cd backend && npx tsc --noEmit`
Expected: no output, no type errors.

Run: `cd frontend && npx ng build`
Expected: builds with no new errors (the pre-existing `agent-log.component.scss` budget warning is expected and unrelated).

Run: `cd backend && npx jest`
Expected: only the two pre-existing, unrelated `databursatil.test.ts` failures remain (confirmed pre-existing on `qa` before this plan — see Global Constraints in `docs/superpowers/plans/2026-06-30-ibkr-account-settings.md` for prior confirmation of this baseline). All `ibkr.test.ts` and `ibkr-market-data.test.ts` tests pass.

If a running backend dev server + configured `IBKR_GATEWAY_URL` + authenticated gateway session are available in your environment, additionally run: `curl "http://localhost:3000/api/market-data/usa?symbol=AAPL"` and confirm it returns a JSON body shaped like `{ symbol, lastPrice, changePct, volume, history: [...] }` rather than the old `501` stub response. If no authenticated gateway is available in this environment, note that in your report — this manual check is a nice-to-have confirmation, not a blocking requirement for this task, since Tasks 1-2's automated tests already cover the actual logic.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/market-data/usa/route.ts backend/lib/claude-agent.ts frontend/src/app/bot-config/bot-config.component.html
git commit -m "feat: wire USA market data into the API route and Claude agent"
```

---

## Self-Review Notes

- **Spec coverage:** `IBKRClient` snapshot/history methods with the documented warm-up retry (Task 1), conid resolution + caching + `getUSAMarketData` (Task 2), wiring into the route and agent plus removing the stale banner (Task 3). All spec sections have a task.
- **Type consistency:** `getMarketDataSnapshot(conid: number): Promise<{ lastPrice: number; changePct: number; volume: number } | null>` (Task 1) matches its consumption in Task 2's `getUSAMarketData` exactly (`snapshot.lastPrice`, `snapshot.changePct`, `snapshot.volume`, null-checked). `getMarketDataHistory(conid: number): Promise<{ date: string; close: number; volume: number }[]>` (Task 1) matches Task 2's direct pass-through into the returned `MXMarketData.history` field. `getUSAMarketData(symbol: string): Promise<MXMarketData>` (Task 2) matches its call site in Task 3's route and `claude-agent.ts` exactly (`data.lastPrice`, `data.history.map(h => h.close)`, etc. — identical field access pattern to the pre-existing MX branch).
- **No placeholders:** all steps contain complete, runnable code.
