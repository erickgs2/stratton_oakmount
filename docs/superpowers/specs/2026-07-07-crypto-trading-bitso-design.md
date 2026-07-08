# Crypto Trading via Bitso (Phase 1 — Foundation + Execution) — Design Spec

**Date:** 2026-07-07
**Scope:** Add cryptocurrency trading as a third market alongside MX (BMV) and USA (NYSE/Nasdaq), executed through Bitso (the user's existing, CNBV-regulated Mexican exchange account) rather than IBKR — IBKR crypto trading was investigated and is not eligible for this account (confirmed via the Client Portal Trading Permissions page: "This account is not eligible to trade this product").

Related: [[project-stratton-oakmont]]

---

## Background

The bot currently trades two markets through one broker (IBKR): MX (BMV) via DataBursátil for quotes + IBKR for execution, and USA (NYSE/Nasdaq) via IBKR for both. Both markets share the same `Market = 'MX' | 'USA'` type threaded through the Prisma schema, `market-hours.ts`, `market-holidays.ts`, the whole `claude-agent.ts` prompt builder, `pnl.ts`, every API route, and every frontend page with a market tab.

Adding crypto means a third market value, but through a **different broker's API entirely** (Bitso, not IBKR), with **different available market data** (no historical OHLC/candles — confirmed by checking Bitso's full endpoint index; only ticker, order book, and recent trades exist) and **24/7 trading** (no market-hours or holiday-calendar concept applies).

**Decision:** Bitso is the execution venue. IBKR crypto was ruled out — not an account-settings issue, the Trading Permissions page doesn't even list crypto as a requestable asset class for this account (consistent with IBKR's known residency-based crypto restrictions).

**Decision:** Since Bitso has no OHLC/candlestick endpoint, this is **not** a port of the existing RSI(14)/MA20/MA50 indicator model. Crypto gets its own indicator set computed from what Bitso actually provides live (ticker, order book, recent trades) plus a new locally-accumulated price-snapshot history (Bitso gives us nothing historical at all — every rolling-window number this bot uses has to be built from snapshots taken cycle-by-cycle going forward). This was chosen over pairing Bitso with a second external market-data API (e.g. Binance, CoinGecko) specifically to avoid a second external dependency, and because genuinely intraday signals fit this bot's scalping strategy better than the daily-bar indicators ever did for stocks.

**Decision:** Claude's decision JSON schema is unchanged (`{action, quantity, confidence, reason}`). `quantity` means coin quantity (fractional, e.g. `0.015`), matching Bitso's `major` order field, which — unlike IBKR crypto's forced `cashQty`-for-buys-only — accepts a coin quantity for both buy and sell. This avoids any schema change to the Claude-facing contract.

**Decision:** Take-profit/stop-loss percentages, confidence threshold, and check-frequency interval default to the **same numeric values already used for MX/USA** (1.5% TP / 1.0% SL / 0.65 confidence / 15 min), not a crypto-specific starting point. Crypto is generally more volatile than BMV/NYSE equities and these defaults may prove too tight in practice (frequent stop-outs) — but picking different numbers now would be guessing without data. Same reasoning already applied when USA was added alongside MX (see the USA Market Data spec: "same defaults as MX ... no extra caution gating for this initial implementation"). All four remain user-editable per-market, so tuning after observing real behavior is the intended path, not a priori adjustment.

**Decision:** The crypto symbol list is a small curated default (e.g. `BTC`, `ETH`, plus 2-3 more majors), not Bitso's full ~20+ pair catalog — mirroring `MX_SYMBOLS`/`USA_SYMBOLS`, which are both curated 5-item arrays today, not "every BMV IPC constituent" or "every NYSE ticker." The exact starting list is chosen from the real `List Available Books` response at implementation time (see Section 6), not guessed here.

**Hard constraint for this spec:** MX and USA behavior must be provably unchanged after this lands. See "Safety: Not Touching MX/USA" below — this is the main engineering risk in this change, not the Bitso integration itself.

---

## Safety: Not Touching MX/USA

The current codebase has several places that branch on market with an implicit binary assumption — `market === 'MX' ? A : B`, where the `else` branch silently means "USA." Adding a third market value through any of these unchanged is the single biggest risk in this feature: **`CRYPTO` would silently fall into the USA branch** (wrong currency, wrong broker, wrong exchange routing) rather than erroring loudly.

Every one of these must become an explicit three-way `switch` or `if/else if/else`, not a widened ternary:

| File | Current pattern | Risk if left as-is |
|---|---|---|
| `backend/lib/market-hours.ts` | `market === 'MX' ? isBMVOpen() : isNYSEOpen()` | CRYPTO would check NYSE hours instead of always being open |
| `backend/lib/claude-agent.ts` → `buildAgentRequestContext` | `if (market === 'MX') { ...databursatil... } else { ...ibkr... }` | CRYPTO would call IBKR's `getUSAMarketData`, which would either error or (worse) silently attempt to resolve a crypto ticker as a US stock conid |
| `backend/lib/claude-agent.ts` → `buildUserPrompt` | `const currency = market === 'MX' ? 'MXN' : 'USD'`, `market === 'MX' ? 'BMV' : 'US'` (appears in the TRADING COSTS section) | Prompt would tell Claude the wrong currency/venue for crypto |
| `backend/lib/ibkr.ts` → `placeOrder` | `exchange: params.market === 'MX' ? 'BMV' : 'SMART'`, `currency: params.market === 'MX' ? 'MXN' : 'USD'` | N/A — crypto orders never call this function at all (see below) |
| `backend/lib/pnl.ts` → `MARKET_TIMEZONE` | `Record<'MX' | 'USA', string>` | TypeScript itself forces this — widening the `Market` type will make this a compile error until a `CRYPTO` entry is added, which is a good thing here |
| `runAgentCycle` (routing to IBKR vs. new Bitso client) | N/A today (only one broker) | Must dispatch on market to the correct client; no shared code path with IBKR order placement |

**Additional guarantees:**
- `backend/lib/ibkr.ts` and `backend/lib/databursatil.ts` are **not edited** by this work at all. Since MX/USA logic lives entirely in those two files' existing functions, not touching them is a stronger guarantee than "I was careful" — the files are simply out of the diff.
- All new code lives in new files (`bitso.ts`, `bitso-market-data.ts`, `crypto-indicators.ts`) plus new `case`/`else if` branches in the shared files above — never a modification to the body of an existing MX or USA branch.
- `Trade.market` / `BotConfig.market` are plain `String` columns (not a Postgres enum), so adding `'CRYPTO'` as a new valid value requires no migration of existing rows and cannot invalidate old data.
- **Regression check before calling this done:** the existing backend test suite (`market-hours.test.ts`, `indicators.test.ts`, `ibkr.test.ts`, `ibkr-market-data.test.ts`, `databursatil.test.ts`) must still pass unmodified, and the "preview request" panel's generated MX/USA prompts must be byte-identical to what they were before this change (diff before/after).

---

## New Types

```typescript
// backend/lib/market.ts (new) — or wherever Market is first declared today;
// this spec assumes it becomes a shared type rather than re-declared per file
export type Market = 'MX' | 'USA' | 'CRYPTO';
```

Every existing `'MX' | 'USA'` type annotation across the backend and frontend widens to import/reuse this. This is mechanical (TypeScript's compiler will flag every `switch`/`Record` that isn't exhaustive) but touches many files — tracked as its own step in the implementation plan, done as one pass rather than interleaved with the Bitso-specific work.

---

## 1. `BitsoClient`

**File:** `backend/lib/bitso.ts` (new)

Structured to match `ibkr.ts`'s shape and conventions (a class wrapping a private signed-request helper, public methods per capability) — not a copy, a parallel:

```typescript
export class BitsoClient {
  private readonly baseUrl: string; // production or api-sandbox.bitso.com, via env var
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private lastNonce = 0;

  private nextNonce(): number {
    // Must be strictly increasing per Bitso's auth spec. Date.now() alone
    // risks two calls in the same millisecond reusing a value — guard with
    // a monotonic floor against the last nonce issued.
    const n = Math.max(Date.now(), this.lastNonce + 1);
    this.lastNonce = n;
    return n;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    // Authorization: Bitso {key}:{nonce}:{signature}
    // signature = HMAC-SHA256(secret, `${nonce}${method}${path}${bodyStr}`), hex-encoded
  }

  async getBalance(): Promise<{ currency: string; available: number; locked: number }[]>;
  async getTicker(book: string): Promise<{ last: number; bid: number; ask: number; volume: number; createdAt: string }>;
  async getOrderBook(book: string): Promise<{ bids: { price: number; amount: number }[]; asks: { price: number; amount: number }[] }>;
  async getTrades(book: string, limit?: number): Promise<{ price: number; amount: number; side: 'buy' | 'sell'; createdAt: string }[]>;
  async placeOrder(params: { book: string; side: 'buy' | 'sell'; major: number }): Promise<string>; // returns oid
  async getOpenOrders(): Promise<{ oid: string; book: string; side: string; status: string; originalAmount: number; unfilledAmount: number }[]>;
  async getFees(): Promise<Record<string, { takerFeeDecimal: number; makerFeeDecimal: number }>>; // per-book, from List Fees
}
```

All orders placed by this bot are market orders (`type: 'market'`), matching the existing bot's behavior on the stock side (`orderType: 'MKT'` in `ibkr.ts`) — no limit/stop order support in this phase (see Out of Scope).

---

## 2. Price-Snapshot Accumulation

**New Prisma model** (`backend/prisma/schema.prisma`):

```prisma
model CryptoPriceSnapshot {
  id        String   @id @default(cuid())
  symbol    String   // Bitso book, e.g. "btc_mxn"
  price     Float
  bidPrice  Float
  askPrice  Float
  volume    Float    // trailing volume at snapshot time, from ticker
  createdAt DateTime @default(now())

  @@index([symbol, createdAt])
}
```

Written once per cycle, for every configured crypto symbol, regardless of the trading decision that cycle — same "record every cycle, not just executed trades" principle already used by `recordLastPrice` in `trading-context.ts`. This is what makes rolling-window indicators (1h/4h/24h change, 24h high/low) possible despite Bitso giving no history: **the bot builds its own history going forward from the day this ships.**

**Bootstrap period, stated plainly:** for roughly the first 24 hours after a symbol starts trading, wider windows (4h, 24h) will have partial or no data. Indicator functions return `null` for a window with insufficient snapshots (see below) — the prompt states "insufficient history yet" rather than asserting a fabricated number, and Claude is instructed to weight confidence down accordingly (same spirit as the existing "insufficient data → neutral 50" fallback in `indicators.ts`'s RSI calculation).

---

## 3. Crypto Indicators

**File:** `backend/lib/crypto-indicators.ts` (new)

Pure computation functions, unit-testable in isolation exactly like `indicators.ts`:

```typescript
export interface CryptoIndicators {
  priceChange1h: number | null;   // null if <1h of snapshots exist yet
  priceChange4h: number | null;
  priceChange24h: number | null;
  high24h: number | null;
  low24h: number | null;
  orderBookImbalance: number;     // -1 (all ask-side depth) .. +1 (all bid-side depth), 0 = balanced
  spreadPct: number;               // (ask - bid) / mid * 100
  recentTradeVolume: number;       // sum of trade amounts in the lookback window
}

export function calculatePriceChange(
  currentPrice: number,
  snapshots: { price: number; createdAt: Date }[],
  windowMinutes: number,
): number | null;

export function calculateOrderBookImbalance(
  orderBook: { bids: { price: number; amount: number }[]; asks: { price: number; amount: number }[] },
  depthPct: number, // consider only levels within this % of mid price
): number;

export function calculateSpreadPct(bid: number, ask: number): number;

export function calculateRecentVolume(
  trades: { amount: number; createdAt: Date }[],
  windowMinutes: number,
): number;

export function calculateCryptoIndicators(
  ticker: { last: number; bid: number; ask: number },
  orderBook: OrderBook,
  trades: Trade[],
  historicalSnapshots: { price: number; createdAt: Date }[], // from CryptoPriceSnapshot, last 24h
): CryptoIndicators;
```

A DB-querying wrapper (fetch the last 24h of `CryptoPriceSnapshot` rows for the symbol, call `calculateCryptoIndicators`) lives in `bitso-market-data.ts`, keeping `crypto-indicators.ts` itself free of Prisma imports — same separation `pnl.ts` uses between its pure FIFO-matching function and its Prisma-querying `getPnlReport`.

---

## 4. `getCryptoMarketData`

**File:** `backend/lib/bitso-market-data.ts` (new)

```typescript
export interface CryptoMarketData {
  symbol: string;
  lastPrice: number;
  changePct: number; // vs. 24h ago, from accumulated snapshots (null-safe: 0 if no 24h-old snapshot yet)
  volume: number;
  indicators: CryptoIndicators;
}

export async function getCryptoMarketData(symbol: string): Promise<CryptoMarketData> {
  const [ticker, orderBook, trades, snapshots] = await Promise.all([
    bitsoClient.getTicker(symbol),
    bitsoClient.getOrderBook(symbol),
    bitsoClient.getTrades(symbol),
    prisma.cryptoPriceSnapshot.findMany({
      where: { symbol, createdAt: { gte: /* 24h ago */ } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const indicators = calculateCryptoIndicators(ticker, orderBook, trades, snapshots);

  // Record this cycle's snapshot for future windows — same "always record,
  // regardless of trade outcome" principle as trading-context.ts.
  await prisma.cryptoPriceSnapshot.create({
    data: { symbol, price: ticker.last, bidPrice: ticker.bid, askPrice: ticker.ask, volume: ticker.volume },
  });

  return {
    symbol,
    lastPrice: ticker.last,
    changePct: indicators.priceChange24h ?? 0,
    volume: ticker.volume,
    indicators,
  };
}
```

---

## 5. Wiring into `claude-agent.ts`

**`buildAgentRequestContext`** gets a third branch (not an `else` fallthrough):

```typescript
if (market === 'MX') {
  // existing, untouched
} else if (market === 'USA') {
  // existing, untouched
} else {
  const data = await getCryptoMarketData(symbol);
  lastPrice = data.lastPrice;
  changePct = data.changePct;
  volume = data.volume;
  // no closePrices/volumes history array — crypto has no daily-bar
  // indicators. calculateIndicators() (RSI/MA) is simply never called
  // for CRYPTO; a parallel prompt section uses `data.indicators` instead.
}
```

**`SYSTEM_PROMPTS.CRYPTO`** — new entry. Same scalping framing as MX/USA (small frequent gains, momentum exception clause), but drops the market-hours/holiday framing entirely and states the market is continuous: *"This market trades 24/7 — there is no open/close, no holiday calendar, and no session boundary. Do not reason about 'end of day.'"*

**`buildUserPrompt`** — the `TECHNICAL INDICATORS` section becomes market-conditional: MX/USA keep the existing RSI/MA/volume-ratio block unchanged; CRYPTO gets a new block presenting `CryptoIndicators` (price change over 1h/4h/24h, order book imbalance, spread, recent volume, 24h high/low, with "insufficient history yet" text where a window is `null`). The RISK MANAGEMENT (take-profit/stop-loss), TRADING COSTS, and DECISION RULES sections are reused as-is — those concepts (P&L-based exit, fee-aware sizing, confidence threshold) apply identically to crypto.

**`buildAgentRequestContext`**'s currency logic: `MX → 'MXN'`, `USA → 'USD'`, `CRYPTO → 'MXN'` (Bitso trades against MXN, matching the user's existing MXN-denominated account — not USD).

**Fee estimate default:** pulled from `BitsoClient.getFees()` per-book at config-save time rather than a hardcoded guess (unlike BMV's `feeEstimatePct`, which had to be estimated from third-party sources since IBKR doesn't expose a fee-lookup endpoint) — this is a genuine improvement over the existing pattern, not just parity.

---

## 6. Order Execution

**`runAgentCycle`** dispatches on market after receiving Claude's decision:

- `MX` / `USA`: existing `ibkrClient.placeOrder(...)` call, **completely unchanged**.
- `CRYPTO`: new branch calling `bitsoClient.placeOrder({ book: symbol, side: decision.action === 'buy' ? 'buy' : 'sell', major: decision.quantity })`.

**Quantity clamping** — the existing `Math.floor(maxInvestment / lastPrice)` (whole-share assumption) does not apply to crypto. New clamping path allows fractional quantities, rounded to the precision Bitso's `List Available Books` reports per-symbol (`tick_size`/minimum amount), rather than floored to an integer.

**Symbol list:** not hardcoded in this spec. At implementation time, call `GET /available_books/` for real and select a small curated set of MXN-quoted major pairs (e.g. `btc_mxn`, `eth_mxn`, plus 2-3 more) per the curated-default-list decision above — rather than guessing Bitso's current offering or exposing its full catalog.

---

## 7. Frontend — additive only

Every page that currently has an MX/USA tab pair gets a third tab, following the exact pattern already established this session (Bot Config's MX/USA blocks, Dashboard's tab switch, Trade Log/Bot Logs/Agent Logs/P&L History market filters) — **copy the pattern, do not restructure the existing two tabs to "make room."** Concretely: `bot-config.component.ts`'s `mxConfig`/`usaConfig` objects gain a sibling `cryptoConfig`; the template gains a third `<mat-tab>` block, not a modification to the existing two. Same principle applies to the dashboard's `Market` type alias and every market filter dropdown/chip-set across the log pages.

Bot Config's crypto tab fields: symbols (coin list, populated from the real Bitso books call above), capital limit (MXN), check frequency, confidence threshold, take-profit/stop-loss — all reused as-is. Fee estimate default comes from Bitso's real fee schedule rather than a manually-set approximation, though the field stays user-editable like the other two markets.

---

## 8. Tests

**File:** `backend/__tests__/crypto-indicators.test.ts` (new)

Pure function tests, no network/DB mocking needed (mirrors `indicators.test.ts`):
- `calculatePriceChange` returns `null` when no snapshot exists at least `windowMinutes` old.
- `calculatePriceChange` returns the correct % change when a qualifying snapshot exists.
- `calculateOrderBookImbalance` returns `0` for a perfectly balanced book, `+1`/`-1` at the extremes.
- `calculateSpreadPct` basic correctness.
- `calculateRecentVolume` sums correctly and excludes trades outside the window.

**File:** `backend/__tests__/bitso.test.ts` (new)

Mirrors `ibkr.test.ts` conventions (mocked HTTP, no real network calls):
- Signature construction produces the documented `nonce+method+path+body` HMAC-SHA256 hex string for a known key/secret/input (a fixed test vector).
- Nonce is strictly increasing across rapid successive calls.
- `placeOrder` sends `major` (not `minor`) and the correct `book`/`side`/`type: 'market'`.

**Regression suite:** run the full existing backend test suite unmodified as part of this work's own verification — see "Safety: Not Touching MX/USA" above.

---

## Out of Scope (this phase)

- **Limit and stop orders** — market orders only, matching the bot's existing MX/USA behavior (`orderType: 'MKT'` today for both).
- **WebSocket market data** (Bitso's Trades/Orders/Diff-Orders channels) — REST polling on the existing per-market interval, matching how MX/USA already work.
- **A second external market-data provider** (Binance, CoinGecko) — explicitly rejected per the "Decision" above in favor of Bitso-native signals.
- **Multi-coin portfolio correlation / cross-coin signals** — each symbol is evaluated independently, same as MX/USA today.
- **The live-money gate** — whether/how a real (non-sandbox) Bitso account gets enabled follows the same conversation already had for USA IBKR trading; not decided in this spec.
- **Historical backtesting** against the newly-accumulated `CryptoPriceSnapshot` data — out of scope; this phase is about live cycle-by-cycle operation only.
