# USA Market Data (Phase 2) — Design Spec

**Date:** 2026-07-01
**Scope:** Implement real USA (NYSE/Nasdaq) market data so the Claude trading agent can run for the USA market, enabling MX and USA to trade concurrently.

Related: [[project-stratton-oakmont]]

---

## Background

Everything needed for dual-market trading already exists and works independently per market: per-market `setInterval` scheduling (`backend/app/api/bot/start/route.ts`), a `BotConfig` row per market with no mutual-exclusion logic, NYSE market hours (`backend/lib/market-hours.ts`), IBKR order placement with the correct `exchange: 'SMART'` / `currency: 'USD'` for USA (`backend/lib/ibkr.ts`'s `placeOrder`), and market-agnostic indicator calculations (`backend/lib/indicators.ts`) and Claude prompts (`backend/lib/claude-agent.ts`). The only missing piece is real market data: `backend/app/api/market-data/usa/route.ts` returns a `501` stub, and `backend/lib/claude-agent.ts:189-191` throws immediately for the USA branch instead of fetching anything. Filling this one gap is sufficient to make both markets tradeable simultaneously — no scheduling, database, or UI changes are needed.

**Decision:** USA market data comes from IBKR's own Client Portal Web API (already an authenticated connection via the existing gateway — no new account or API key), not a third-party provider like Alpha Vantage or Polygon.

**Decision:** USA uses the same defaults as MX (confidence threshold 0.65, 15-minute interval) — no extra caution gating for this initial implementation. (Capital limit already differs in the existing frontend defaults — $1,000 USD for USA vs $10,000 MXN for MX — reflecting the different currencies; that's pre-existing, not part of this change.)

---

## Target Shape

`getUSAMarketData(symbol)` must return exactly the shape already defined by `MXMarketData` in `backend/lib/databursatil.ts`:

```typescript
export interface MXMarketData {
  symbol: string;
  lastPrice: number;
  changePct: number;
  volume: number;
  history: { date: string; close: number; volume: number }[];
}
```

This type is reused as-is (imported into the new file, not duplicated) so `claude-agent.ts`'s consumption code (`data.lastPrice`, `data.history.map(h => h.close)`, etc.) and `calculateIndicators()` work identically for both markets with no changes to either.

---

## 1. `IBKRClient` additions

**File:** `backend/lib/ibkr.ts`

Two new public methods, alongside the existing `getPositions`/`getAccountSummary`/`placeOrder`, using the same private `request()` helper:

### `getMarketDataSnapshot(conid: number): Promise<{ lastPrice: number; changePct: number; volume: number } | null>`

Calls `GET /iserver/marketdata/snapshot?conids={conid}&fields=31,83,87` (field IDs verified against IBKR's own API spec: `31` = Last Price, `83` = Change %, `87` = Volume).

**Critical quirk to handle:** IBKR's snapshot endpoint returns incomplete data on the *first* call for a given `conid` — it only initiates the market data subscription ("market data farm warm-up"); the documented behavior is that the endpoint needs to be called multiple times before all fields are populated. This method must retry: call the endpoint, check whether fields `31`, `83`, and `87` are all present in the response; if not, wait briefly (500ms) and retry, up to 3 attempts total. If still incomplete after 3 attempts, return `null` (not throw) — the caller decides how to handle missing data, matching the existing "not treat momentary unavailability as fatal" pattern already used elsewhere (e.g., `checkAuthStatus`'s tolerant error handling).

Response field values in IBKR's snapshot response are typically strings (e.g., `"168.42"`) even though they represent numbers — parse with `parseFloat`.

### `getMarketDataHistory(conid: number): Promise<{ date: string; close: number; volume: number }[]>`

Calls `GET /iserver/marketdata/history?conid={conid}&period=60d&bar=1d` — 60 daily bars, matching MX's 60-day daily history used for RSI/MA/volume-ratio indicators.

Response shape: `{ data: [{ t: number, o: number, h: number, l: number, c: number, v: number }, ...], ... }` — `t` is an epoch-millisecond timestamp, `c` is the close, `v` is the volume. Map each entry to `{ date: <t converted to 'YYYY-MM-DD'>, close: c, volume: v }`, sorted ascending by date (matching MX's `history` ordering, which the indicator calculations depend on).

---

## 2. Conid resolution + caching

**File:** `backend/lib/ibkr-market-data.ts` (new)

`IBKRClient.searchConid(symbol, exchange)` already exists and is reused unchanged (it's the same method used for order placement) — call it with `exchange: 'SMART'` for consistency with how USA orders are placed. Results are cached in a module-level `Map<string, number>` (symbol → conid) so repeated polling cycles for the same symbol (every `intervalMin` minutes, per the existing per-market interval loop) don't re-resolve the conid on every call. This is a simple in-memory cache — no persistence needed, since conids for a given stock ticker do not change and re-resolving once per backend process restart is a fully acceptable, negligible cost (`searchConid` is a single lightweight IBKR API call).

If `searchConid` returns `null` (symbol not found), `getUSAMarketData` throws a clear error (`No conid found for symbol ${symbol}`), matching MX's existing pattern of throwing on missing quote data rather than silently returning zeros.

---

## 3. `getUSAMarketData`

**File:** `backend/lib/ibkr-market-data.ts` (same new file)

```typescript
export async function getUSAMarketData(symbol: string): Promise<MXMarketData> {
  const conid = await resolveConid(symbol); // cached lookup via searchConid
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

This mirrors `getMXMarketData`'s shape and error-handling style exactly (throw with a matching message format on missing quote data) so `claude-agent.ts`'s error handling doesn't need market-specific branches.

---

## 4. Wire into the two existing stub points

**File:** `backend/app/api/market-data/usa/route.ts`

Replace the `501` stub with the same pattern as `backend/app/api/market-data/mx/route.ts`: read `symbol` from query params, call `getUSAMarketData(symbol)`, return JSON or a `500` with the error message on failure.

**File:** `backend/lib/claude-agent.ts`, lines 189-191

Replace:
```typescript
} else {
  throw new Error('USA market data not yet implemented — set ACTIVE_MARKET=MX for Phase 1');
}
```
with the USA equivalent of the MX branch immediately above it:
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

---

## 5. Frontend

No changes needed. The Bot Config page's "Phase 2 — Set ACTIVE_MARKET=USA..." banner (`bot-config.component.html`) is now inaccurate (there is no `ACTIVE_MARKET` gating in the code — both markets already run whenever their own `isActive` toggle is on) and should be removed as part of this change, since leaving a stale/misleading banner in place would be worse than having none. This is a one-line template removal, not a new feature.

---

## 6. Backend tests

**File:** `backend/__tests__/ibkr-market-data.test.ts` (new)

Following the existing `databursatil.test.ts` / `ibkr.test.ts` conventions (mock `https`/`IBKRClient`, no real network calls):

- `getUSAMarketData` returns the correctly-shaped object when snapshot + history both succeed.
- `getUSAMarketData` throws a clear error when `searchConid` returns `null`.
- `getUSAMarketData` throws a clear error when the snapshot never completes (returns `null` after retries).
- conid resolution is cached — calling `getUSAMarketData` twice for the same symbol only calls `searchConid` once.

**File:** `backend/__tests__/ibkr.test.ts` (extended)

- `getMarketDataSnapshot` parses fields `31`/`83`/`87` correctly from a complete response.
- `getMarketDataSnapshot` retries when fields are incomplete on the first call, succeeds on a later attempt.
- `getMarketDataSnapshot` returns `null` after exhausting retries with still-incomplete data.
- `getMarketDataHistory` maps the `data` array's `t`/`c`/`v` fields to `{ date, close, volume }` correctly, including the epoch-to-`YYYY-MM-DD` date conversion.

---

## Out of Scope

- Any third-party market data provider (Alpha Vantage, Polygon, etc.) — IBKR's own API is the sole source per the decision above.
- Extra risk gating (lower confidence threshold, smaller capital limit) for USA's initial run — same defaults as MX per the decision above.
- Removing or renaming `MXMarketData` to a market-agnostic name (e.g. `MarketData`) — reused as-is to keep this change minimal; a rename is a pure refactor with no functional benefit and isn't requested.
- Real-time streaming market data (WebSocket) — polling via the snapshot/history REST endpoints on the existing per-market interval is sufficient and matches MX's own polling-based approach.
