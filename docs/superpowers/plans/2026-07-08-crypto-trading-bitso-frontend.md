# Crypto Trading via Bitso — Frontend UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CRYPTO tab/option to every page that currently has an MX/USA tab pair (Bot Config, Dashboard, Trade Log, Bot Logs, Agent Logs, PnL History), so the crypto trading backend built in `docs/superpowers/plans/2026-07-07-crypto-trading-bitso-backend.md` is fully usable from the UI — with zero changes to existing MX/USA screens.

**Architecture:** Purely additive: every component gains a third tab/chip/option alongside the existing two, reusing each page's exact established pattern (same `mat-tab-group`/`mat-chip-set`/`mat-select` structure, same polling/loading/error conventions). One small backend addition is required first — a read-only crypto balances endpoint (`GET /api/portfolio/crypto`, wrapping the already-built `BitsoClient.getBalances()`) — since the Dashboard's existing funds/positions cards come from an IBKR-only endpoint with no Bitso equivalent. A second small backend fix (widen `bot/logs/route.ts`'s hardcoded market whitelist) closes a gap missed in the original backend plan.

**Tech Stack:** Angular 17 standalone components + Angular Material, RxJS, Next.js API routes (for the one new backend endpoint).

## Global Constraints

- Existing MX/USA UI behavior must not change in any way. Every existing template block, component field, and service method keeps its current behavior for `'MX'`/`'USA'` inputs — CRYPTO is additive only, never a restructuring.
- No new Angular routes — every CRYPTO addition is a new tab/chip/option inside an existing page component, not a new page.
- This codebase has zero Angular component test infrastructure (confirmed: no `.spec.ts` files are exercised in the existing workflow). Verification is `tsc`/build-clean plus Playwright visual checks (mobile 390px + desktop), matching the established convention used throughout this project for every prior UI change this session.
- No live IBKR gateway or real Bitso API credentials exist in this dev environment (established fact from the backend plan's Task 13). The `<app-ibkr-auth-gate>` overlay must be hidden via injected CSS (`page.addStyleTag`) during Playwright verification, matching every prior UI-verification pass in this project. CRYPTO tabs are expected to show their loading/error/empty states cleanly rather than live data — that is a passing result, not a blocker.
- Currency for all crypto data is always `MXN`.
- Crypto symbol list is a small hardcoded curated set (`['btc_mxn', 'eth_mxn']`), matching how `MX_SYMBOLS`/`USA_SYMBOLS` are already hardcoded arrays in `bot-config.component.ts`, not fetched live from Bitso.
- Reuse this codebase's already-established `Market` widening pattern from the backend plan: a single shared type (`frontend/src/app/core/models/market.model.ts`), imported everywhere a market discriminator's type needs widening — no file re-declares its own local `'MX' | 'USA'` union after this plan touches it.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `backend/lib/bitso-portfolio.ts` | Create | `getCryptoPortfolio(symbols)` — combines `BitsoClient.getBalances()` + per-symbol `getTicker()` into a simple funds/positions summary for the Dashboard. |
| `backend/app/api/portfolio/crypto/route.ts` | Create | `GET` endpoint exposing `getCryptoPortfolio` for the configured CRYPTO symbols. |
| `backend/app/api/bot/logs/route.ts` | Modify | Widen `VALID_MARKETS` to include `'CRYPTO'` (gap missed in the original backend plan — this route has its own hardcoded whitelist, unlike the other 9 routes). |
| `frontend/src/app/core/models/market.model.ts` | Create | Single shared `Market` type (`'MX' \| 'USA' \| 'CRYPTO'`). |
| `frontend/src/app/core/models/crypto-portfolio.model.ts` | Create | `CryptoPortfolio`/`CryptoPosition` interfaces matching the new backend endpoint. |
| `frontend/src/app/core/services/crypto-portfolio.service.ts` | Create | Thin HTTP wrapper for `GET /api/portfolio/crypto`. |
| `frontend/src/app/core/models/bot-config.model.ts` | Modify | Widen `market` to `Market`. |
| `frontend/src/app/core/models/trade.model.ts` | Modify | Widen `market` to `Market`. |
| `frontend/src/app/core/models/pnl.model.ts` | Modify | Widen `market` to `Market`. |
| `frontend/src/app/core/models/agent-request-preview.model.ts` | Modify | Split into a discriminated union (`StockAgentRequestPreview \| CryptoAgentRequestPreview`) matching the backend's two distinct preview shapes. |
| `frontend/src/app/core/models/agent-log.model.ts` | Modify | Add `CryptoAgentLogIndicators`; widen `AgentLogMarketData` for the crypto-shaped (no `changePct`/`volume`) log payload. |
| `frontend/src/app/core/services/bot.service.ts` | Modify | Widen `StartBotPayload.market`, `getStatus`/`stopBot` params, `BotStatusResponse.markets`. |
| `frontend/src/app/core/services/pnl.service.ts` | Modify | Widen `getReport(market)`. |
| `frontend/src/app/core/services/trade.service.ts` | Modify | Widen `TradeFilters.market`. |
| `frontend/src/app/core/services/bot-log.service.ts` | Modify | Widen `getLogs`'s `market` param. |
| `frontend/src/app/core/services/agent-log.service.ts` | Modify | Widen `getLogs`/`getRequestPreview` params. |
| `frontend/src/app/bot-config/bot-config.component.ts` / `.html` | Modify | Add `cryptoConfig` + a third `<mat-tab>`, mirroring the MX tab exactly. |
| `frontend/src/app/dashboard/dashboard.component.ts` / `.html` / `.scss` | Modify | Add a third `<mat-tab>` with its own template (`#cryptoContent`), consuming the new `CryptoPortfolioService`; existing `#marketContent` template (MX/USA) untouched. |
| `frontend/src/app/trade-log/trade-log.component.ts` / `.html` | Modify | Add a CRYPTO option to the market filter select (desktop + mobile dialog). |
| `frontend/src/app/bot-logs/bot-logs-page.component.ts` / `.html` | Modify | Add a CRYPTO chip to the market filter (desktop + mobile dialog). |
| `frontend/src/app/agent-logs/agent-logs-page.component.ts` / `.html` | Modify | Add a CRYPTO chip. |
| `frontend/src/app/agent-log/agent-log.component.ts` | Modify | Make `inputFieldLabels`/`inputKeys`/`getFieldValue` market-conditional (crypto shows different indicator fields than stock RSI/MA). |
| `frontend/src/app/request-examples/request-examples.component.ts` / `.html` | Modify | Add a CRYPTO slot; make `readableRows` market-conditional via the new discriminated union. |
| `frontend/src/app/pnl-history/pnl-history.component.ts` / `.html` | Modify | Add a third `<mat-tab>`. |

---

### Task 1: Backend — crypto portfolio endpoint + bot/logs CRYPTO fix

**Files:**
- Create: `backend/lib/bitso-portfolio.ts`
- Create: `backend/app/api/portfolio/crypto/route.ts`
- Modify: `backend/app/api/bot/logs/route.ts`

**Interfaces:**
- Consumes: `bitsoClient` (`getBalances()`, `getTicker()`) from `backend/lib/bitso.ts`, `prisma.botConfig`.
- Produces: `export interface CryptoPosition { book: string; baseCurrency: string; quantity: number; lastPrice: number; mktValue: number; }`, `export interface CryptoPortfolio { currency: 'MXN'; availableFunds: number; netLiquidation: number; positions: CryptoPosition[]; }`, `export async function getCryptoPortfolio(symbols: string[]): Promise<CryptoPortfolio>` — consumed by the frontend's Task 4.

No Jest test for `getCryptoPortfolio` — it's a thin I/O-orchestrating wrapper (network calls only), matching the established convention for this kind of function in this codebase (`getCryptoMarketData` in `bitso-market-data.ts` has no dedicated test either). Verified via `tsc` + a manual curl check in Task 9.

- [ ] **Step 1: Implement getCryptoPortfolio**

```typescript
// backend/lib/bitso-portfolio.ts
import { bitsoClient } from '@/lib/bitso';

export interface CryptoPosition {
  book: string;
  baseCurrency: string;
  quantity: number;
  lastPrice: number;
  mktValue: number;
}

export interface CryptoPortfolio {
  currency: 'MXN';
  availableFunds: number;
  netLiquidation: number;
  positions: CryptoPosition[];
}

// getBalances() is the only authenticated Bitso call here (single nonce,
// no concurrency risk); getTicker() per symbol is unauthenticated and safe
// to run in parallel. Does not compute cost basis/unrealized P&L — that
// requires the FIFO trade-history walk already used internally by
// crypto-agent.ts's computeAvgCostFromTrades, which is out of scope for a
// simple balances summary.
export async function getCryptoPortfolio(symbols: string[]): Promise<CryptoPortfolio> {
  const [balances, tickers] = await Promise.all([
    bitsoClient.getBalances(),
    Promise.all(symbols.map(book => bitsoClient.getTicker(book))),
  ]);

  const mxnBalance = balances.find(b => b.currency === 'mxn');
  const availableFunds = mxnBalance?.available ?? 0;

  const positions: CryptoPosition[] = symbols.map((book, i) => {
    const baseCurrency = book.split('_')[0];
    const balance = balances.find(b => b.currency === baseCurrency);
    const quantity = balance?.total ?? 0;
    const lastPrice = tickers[i].last;
    return { book, baseCurrency, quantity, lastPrice, mktValue: quantity * lastPrice };
  });

  const netLiquidation = availableFunds + positions.reduce((sum, p) => sum + p.mktValue, 0);

  return { currency: 'MXN', availableFunds, netLiquidation, positions };
}
```

- [ ] **Step 2: Implement the API route**

```typescript
// backend/app/api/portfolio/crypto/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCryptoPortfolio } from '@/lib/bitso-portfolio';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const config = await prisma.botConfig.findUnique({ where: { market: 'CRYPTO' } });
  const symbols = config?.symbols ?? [];

  if (symbols.length === 0) {
    return NextResponse.json({ currency: 'MXN', availableFunds: 0, netLiquidation: 0, positions: [] });
  }

  try {
    const portfolio = await getCryptoPortfolio(symbols);
    return NextResponse.json(portfolio);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Fix bot/logs/route.ts's market whitelist**

This route was missed in the original backend plan's Task 12 sweep — it has its own hardcoded `VALID_MARKETS` array (unlike the other 9 routes, which either had no validation or were explicitly widened). Change line 6:

```typescript
const VALID_MARKETS = ['MX', 'USA'];
```

to:

```typescript
const VALID_MARKETS = ['MX', 'USA', 'CRYPTO'];
```

- [ ] **Step 4: Verify the build**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/bitso-portfolio.ts backend/app/api/portfolio/crypto/route.ts backend/app/api/bot/logs/route.ts
git commit -m "feat: add crypto portfolio endpoint and fix bot/logs CRYPTO validation gap"
```

---

### Task 2: Frontend — shared Market type + widen all models/services

**Files:**
- Create: `frontend/src/app/core/models/market.model.ts`
- Modify: `frontend/src/app/core/models/bot-config.model.ts`
- Modify: `frontend/src/app/core/models/trade.model.ts`
- Modify: `frontend/src/app/core/models/pnl.model.ts`
- Modify: `frontend/src/app/core/services/bot.service.ts`
- Modify: `frontend/src/app/core/services/pnl.service.ts`
- Modify: `frontend/src/app/core/services/trade.service.ts`
- Modify: `frontend/src/app/core/services/bot-log.service.ts`
- Modify: `frontend/src/app/core/services/agent-log.service.ts`

**Interfaces:**
- Produces: `export type Market = 'MX' | 'USA' | 'CRYPTO';` — consumed by every task below.

- [ ] **Step 1: Create the shared Market type**

```typescript
// frontend/src/app/core/models/market.model.ts
export type Market = 'MX' | 'USA' | 'CRYPTO';
```

- [ ] **Step 2: Widen bot-config.model.ts**

```typescript
// frontend/src/app/core/models/bot-config.model.ts
import { Market } from './market.model';

export interface BotConfig {
  id: string;
  market: Market;
  symbols: string[];
  capitalLimit: number;
  intervalMin: number;
  confidenceThreshold: number;
  takeProfitPct: number;
  stopLossPct: number;
  feeEstimatePct: number;
  isActive: boolean;
  updatedAt: string;
}
```

- [ ] **Step 3: Widen trade.model.ts**

```typescript
// frontend/src/app/core/models/trade.model.ts
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
  createdAt: string;
}
```

- [ ] **Step 4: Widen pnl.model.ts**

```typescript
// frontend/src/app/core/models/pnl.model.ts
import { Market } from './market.model';

export interface DailyPnlSummary {
  date: string;
  realizedPnl: number;
  buys: number;
  sells: number;
  holds: number;
  outcome: 'win' | 'loss' | 'flat';
}

export interface PnlReport {
  market: Market;
  currency: string;
  currentSessionRealizedPnl: number;
  allTimeRealizedPnl: number;
  days: DailyPnlSummary[];
}
```

- [ ] **Step 5: Widen bot.service.ts**

```typescript
// frontend/src/app/core/services/bot.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BotConfig } from '../models/bot-config.model';
import { Market } from '../models/market.model';

export interface StartBotPayload {
  market: Market;
  symbols: string[];
  capitalLimit: number;
  intervalMin: number;
  confidenceThreshold: number;
  takeProfitPct: number;
  stopLossPct: number;
  feeEstimatePct: number;
}

export interface BotStatusResponse {
  configs: BotConfig[];
  markets: { MX: boolean; USA: boolean; CRYPTO: boolean };
}

@Injectable({ providedIn: 'root' })
export class BotService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getStatus(market?: Market): Observable<BotStatusResponse> {
    const url = market
      ? `${this.apiUrl}/bot/status?market=${market}`
      : `${this.apiUrl}/bot/status`;
    return this.http.get<BotStatusResponse>(url);
  }

  saveConfig(payload: StartBotPayload): Observable<{ status: string; config: BotConfig }> {
    return this.http.post<{ status: string; config: BotConfig }>(
      `${this.apiUrl}/bot/config`,
      payload
    );
  }

  startBot(payload: StartBotPayload): Observable<{ status: string; config: BotConfig }> {
    return this.http.post<{ status: string; config: BotConfig }>(
      `${this.apiUrl}/bot/start`,
      payload
    );
  }

  stopBot(market: Market): Observable<{ status: string; market: string }> {
    return this.http.post<{ status: string; market: string }>(
      `${this.apiUrl}/bot/stop`,
      { market }
    );
  }
}
```

- [ ] **Step 6: Widen pnl.service.ts**

```typescript
// frontend/src/app/core/services/pnl.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PnlReport } from '../models/pnl.model';
import { Market } from '../models/market.model';

@Injectable({ providedIn: 'root' })
export class PnlService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getReport(market: Market): Observable<PnlReport> {
    const params = new HttpParams().set('market', market);
    return this.http.get<PnlReport>(`${this.apiUrl}/pnl`, { params });
  }
}
```

- [ ] **Step 7: Widen trade.service.ts**

```typescript
// frontend/src/app/core/services/trade.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Trade } from '../models/trade.model';
import { Market } from '../models/market.model';

export interface TradeFilters {
  market?: Market;
  symbol?: string;
  from?: string;
}

@Injectable({ providedIn: 'root' })
export class TradeService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getTrades(filters: TradeFilters = {}): Observable<Trade[]> {
    let params = new HttpParams();
    if (filters.market) params = params.set('market', filters.market);
    if (filters.symbol) params = params.set('symbol', filters.symbol);
    if (filters.from) params = params.set('from', filters.from);
    return this.http.get<Trade[]>(`${this.apiUrl}/trades`, { params });
  }
}
```

- [ ] **Step 8: Widen bot-log.service.ts**

```typescript
// frontend/src/app/core/services/bot-log.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BotLog } from '../models/bot-log.model';
import { Market } from '../models/market.model';

@Injectable({ providedIn: 'root' })
export class BotLogService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getLogs(params: { market?: Market; level?: 'info' | 'warn' | 'error'; limit?: number } = {}): Observable<{ logs: BotLog[] }> {
    let httpParams = new HttpParams();
    if (params.market) httpParams = httpParams.set('market', params.market);
    if (params.level) httpParams = httpParams.set('level', params.level);
    if (params.limit != null) httpParams = httpParams.set('limit', params.limit.toString());
    return this.http.get<{ logs: BotLog[] }>(`${this.apiUrl}/bot/logs`, { params: httpParams });
  }
}
```

- [ ] **Step 9: Widen agent-log.service.ts**

```typescript
// frontend/src/app/core/services/agent-log.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AgentLog } from '../models/agent-log.model';
import { AgentRequestPreview } from '../models/agent-request-preview.model';
import { Market } from '../models/market.model';

@Injectable({ providedIn: 'root' })
export class AgentLogService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getLogs(market: Market, limit = 50): Observable<{ logs: AgentLog[] }> {
    const params = new HttpParams()
      .set('market', market)
      .set('limit', limit.toString());
    return this.http.get<{ logs: AgentLog[] }>(`${this.apiUrl}/agent/logs`, { params });
  }

  getRequestPreview(market: Market): Observable<AgentRequestPreview> {
    const params = new HttpParams().set('market', market);
    return this.http.get<AgentRequestPreview>(`${this.apiUrl}/agent/preview`, { params });
  }
}
```

- [ ] **Step 10: Verify the build**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: exit 0. (This will show errors in every file that still uses the narrower `'MX' | 'USA'` type where these widened types now flow in — that's expected; those errors are fixed in Tasks 3-8. If this specific command doesn't exist in this project, use `cd frontend && npx ng build --configuration development` instead and read the same signal from its compile errors.)

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/core/models/market.model.ts frontend/src/app/core/models/bot-config.model.ts \
        frontend/src/app/core/models/trade.model.ts frontend/src/app/core/models/pnl.model.ts \
        frontend/src/app/core/services/bot.service.ts frontend/src/app/core/services/pnl.service.ts \
        frontend/src/app/core/services/trade.service.ts frontend/src/app/core/services/bot-log.service.ts \
        frontend/src/app/core/services/agent-log.service.ts
git commit -m "feat: add shared Market type, widen models and services for CRYPTO"
```

---

### Task 3: Frontend — Bot Config CRYPTO tab

**Files:**
- Modify: `frontend/src/app/bot-config/bot-config.component.ts`
- Modify: `frontend/src/app/bot-config/bot-config.component.html`

**Interfaces:**
- Consumes: `Market` (Task 2), `BotService`/`StartBotPayload` (Task 2, already CRYPTO-aware).
- Produces: nothing new consumed elsewhere — this task's `cryptoConfig`/`saveConfig('CRYPTO')` are used only within this component.

- [ ] **Step 1: Add cryptoConfig, CRYPTO_SYMBOLS, and widen method signatures**

Add the import and curated symbol list near the top of `bot-config.component.ts` (alongside the existing `MX_SYMBOLS`/`USA_SYMBOLS` constants):

```typescript
import { Market } from '../core/models/market.model';

const MX_SYMBOLS = ['AMXL', 'FEMSAUBD', 'WALMEX', 'BIMBOA', 'GCARSOA1'];
const USA_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'];
const CRYPTO_SYMBOLS = ['btc_mxn', 'eth_mxn'];
```

Add `cryptoSymbols` and `cryptoConfig` fields, alongside the existing `mxSymbols`/`mxConfig`/`usaSymbols`/`usaConfig`:

```typescript
  mxSymbols = MX_SYMBOLS;
  usaSymbols = USA_SYMBOLS;
  cryptoSymbols = CRYPTO_SYMBOLS;

  mxConfig: Partial<BotConfig> = {
    market: 'MX', symbols: ['AMXL'], capitalLimit: 10000, intervalMin: 15,
    confidenceThreshold: 0.65, takeProfitPct: 1.5, stopLossPct: 1.0, feeEstimatePct: 0.30,
  };
  usaConfig: Partial<BotConfig> = {
    market: 'USA', symbols: ['AAPL'], capitalLimit: 1000, intervalMin: 15,
    confidenceThreshold: 0.65, takeProfitPct: 1.5, stopLossPct: 1.0, feeEstimatePct: 0.05,
  };
  cryptoConfig: Partial<BotConfig> = {
    market: 'CRYPTO', symbols: ['btc_mxn'], capitalLimit: 500, intervalMin: 15,
    confidenceThreshold: 0.65, takeProfitPct: 1.5, stopLossPct: 1.0, feeEstimatePct: 0.65,
  };
```

Change `ngOnInit` to also load the CRYPTO config:

```typescript
  ngOnInit(): void {
    this.botService.getStatus().subscribe(response => {
      const mx = response.configs.find(c => c.market === 'MX');
      const usa = response.configs.find(c => c.market === 'USA');
      const crypto = response.configs.find(c => c.market === 'CRYPTO');
      if (mx) this.mxConfig = { ...mx };
      if (usa) this.usaConfig = { ...usa };
      if (crypto) this.cryptoConfig = { ...crypto };
    });

    this.settingsService.getSettings().subscribe(settings => {
      this.ibkrAccountId = settings.ibkrAccountId ?? '';
    });
  }
```

Change `onSymbolChange` and `saveConfig` to widen their `market` parameter type from `'MX' | 'USA'` to `Market` and add the CRYPTO branch:

```typescript
  onSymbolChange(event: MatChipListboxChange, market: Market): void {
    const selected = Array.isArray(event.value) ? event.value : [event.value];
    if (market === 'MX') this.mxConfig.symbols = selected;
    else if (market === 'USA') this.usaConfig.symbols = selected;
    else this.cryptoConfig.symbols = selected;
  }

  saveConfig(market: Market): void {
    const config = market === 'MX' ? this.mxConfig : market === 'USA' ? this.usaConfig : this.cryptoConfig;
    this.saving = true;

    const payload = {
      market,
      symbols: config.symbols ?? [],
      capitalLimit: config.capitalLimit ?? 10000,
      intervalMin: config.intervalMin ?? 15,
      confidenceThreshold: config.confidenceThreshold ?? 0.65,
      takeProfitPct: config.takeProfitPct ?? 1.5,
      stopLossPct: config.stopLossPct ?? 1.0,
      feeEstimatePct: config.feeEstimatePct ?? 0.10,
    };

    // Always persist the config first, then start/stop the bot if needed
    this.botService.saveConfig(payload).pipe(
      switchMap(() => config.isActive
        ? this.botService.startBot(payload)
        : this.botService.stopBot(market)
      ),
    ).subscribe({
      next: () => {
        this.snackBar.open('Configuration saved', 'OK', { duration: 3000 });
        this.saving = false;
      },
      error: () => { this.saving = false; },
    });
  }
```

Note: the old `feeEstimatePct: config.feeEstimatePct ?? (market === 'MX' ? 0.30 : 0.05)` had no CRYPTO branch and would have silently applied the wrong stock-market default — replaced with a neutral `0.10` fallback (matching the backend Prisma schema's own documented "neutral fallback" default) rather than guessing a specific market's number. Each market's own `mxConfig`/`usaConfig`/`cryptoConfig` initial literal already supplies the real per-market default before any server data loads, so this fallback is rarely actually hit.

- [ ] **Step 2: Add the CRYPTO tab to the template**

Add a third `<mat-tab>` to `bot-config.component.html`, immediately after the closing `</mat-tab>` of the USA tab and before the closing `</mat-tab-group>`:

```html
  <!-- CRYPTO Market Tab -->
  <mat-tab label="CRYPTO — Bitso">
    <div class="config-section">
      <mat-card class="config-card">
        <h3>Symbols (Bitso)</h3>
        <mat-chip-listbox
          multiple
          [value]="cryptoConfig.symbols"
          (change)="onSymbolChange($event, 'CRYPTO')">
          <mat-chip-option *ngFor="let s of cryptoSymbols" [value]="s">{{ s | uppercase }}</mat-chip-option>
        </mat-chip-listbox>
      </mat-card>

      <mat-card class="config-card">
        <h3>Trading Parameters</h3>
        <div class="config-grid">
          <div class="field-block">
            <h4>
              Capital Limit per Cycle (MXN)
              <mat-icon #capitalLimitInfoCRYPTO="matTooltip" class="field-info-icon" matTooltip="Maximum cash the bot is allowed to use across all symbols in a single cycle. The 20% rule is applied per symbol on top of this limit." matTooltipPosition="above" matTooltipTouchGestures="off" aria-label="Field info" (click)="capitalLimitInfoCRYPTO.toggle()">info_outline</mat-icon>
            </h4>
            <mat-form-field appearance="outline">
              <mat-label>Capital Limit (MXN)</mat-label>
              <input matInput type="number" [(ngModel)]="cryptoConfig.capitalLimit" min="100">
            </mat-form-field>
          </div>

          <div class="field-block">
            <h4>
              Check Frequency
              <mat-icon #intervalInfoCRYPTO="matTooltip" class="field-info-icon" matTooltip="How often the bot re-evaluates this market and may act, in minutes. Crypto trades 24/7, so this runs continuously with no market-hours pause." matTooltipPosition="above" matTooltipTouchGestures="off" aria-label="Field info" (click)="intervalInfoCRYPTO.toggle()">info_outline</mat-icon>
            </h4>
            <mat-form-field appearance="outline">
              <mat-label>Interval (minutes)</mat-label>
              <input matInput type="number" [(ngModel)]="cryptoConfig.intervalMin" min="1" max="1440">
            </mat-form-field>
          </div>

          <div class="field-block">
            <h4>
              Confidence Threshold
              <mat-icon #confidenceInfoCRYPTO="matTooltip" class="field-info-icon" matTooltip="Claude must reach this confidence level (0.00–1.00) to execute a trade. Lower = more trades, higher = more selective." matTooltipPosition="above" matTooltipTouchGestures="off" aria-label="Field info" (click)="confidenceInfoCRYPTO.toggle()">info_outline</mat-icon>
            </h4>
            <mat-form-field appearance="outline">
              <mat-label>Confidence Threshold</mat-label>
              <input matInput type="number" [(ngModel)]="cryptoConfig.confidenceThreshold" min="0.50" max="0.95" step="0.05">
              <mat-hint>Current: {{ cryptoConfig.confidenceThreshold | number:'1.2-2' }} — recommended 0.65–0.75</mat-hint>
            </mat-form-field>
          </div>

          <div class="field-block">
            <h4>
              Take-Profit Target (%)
              <mat-icon #takeProfitInfoCRYPTO="matTooltip" class="field-info-icon" matTooltip="Target gain on an open position, as a percent. Claude is instructed to prefer selling once a position's unrealized P&L reaches this level, unless strong aligned momentum justifies holding longer." matTooltipPosition="above" matTooltipTouchGestures="off" aria-label="Field info" (click)="takeProfitInfoCRYPTO.toggle()">info_outline</mat-icon>
            </h4>
            <mat-form-field appearance="outline">
              <mat-label>Take-Profit (%)</mat-label>
              <input matInput type="number" [(ngModel)]="cryptoConfig.takeProfitPct" min="0.2" max="10" step="0.1">
              <mat-hint>Current: {{ cryptoConfig.takeProfitPct | number:'1.1-2' }}% — recommended 0.5–2.0% for scalping</mat-hint>
            </mat-form-field>
          </div>

          <div class="field-block">
            <h4>
              Stop-Loss Threshold (%)
              <mat-icon #stopLossInfoCRYPTO="matTooltip" class="field-info-icon" matTooltip="Maximum acceptable loss on an open position, as a percent. Claude is instructed to prefer selling once a position's unrealized P&L falls to this level, to cut losses quickly." matTooltipPosition="above" matTooltipTouchGestures="off" aria-label="Field info" (click)="stopLossInfoCRYPTO.toggle()">info_outline</mat-icon>
            </h4>
            <mat-form-field appearance="outline">
              <mat-label>Stop-Loss (%)</mat-label>
              <input matInput type="number" [(ngModel)]="cryptoConfig.stopLossPct" min="0.2" max="10" step="0.1">
              <mat-hint>Current: {{ cryptoConfig.stopLossPct | number:'1.1-2' }}% — recommended 0.5–1.5%</mat-hint>
            </mat-form-field>
          </div>

          <div class="field-block">
            <h4>
              Estimated Round-Trip Fee (%)
              <mat-icon #feeInfoCRYPTO="matTooltip" class="field-info-icon" matTooltip="Approximate combined cost (Bitso taker fees, buy + sell) of a full round trip, as a percent of trade value. Claude avoids trades whose expected edge is too small to clear this cost. The bot also checks Bitso's live per-book fee schedule at request time and prefers that over this value when available — this field is the fallback." matTooltipPosition="above" matTooltipTouchGestures="off" aria-label="Field info" (click)="feeInfoCRYPTO.toggle()">info_outline</mat-icon>
            </h4>
            <mat-form-field appearance="outline">
              <mat-label>Round-Trip Fee (%)</mat-label>
              <input matInput type="number" [(ngModel)]="cryptoConfig.feeEstimatePct" min="0" max="5" step="0.01">
              <mat-hint>Current: {{ cryptoConfig.feeEstimatePct | number:'1.2-2' }}% — approximate, editable</mat-hint>
            </mat-form-field>
          </div>
        </div>
      </mat-card>

      <mat-card class="config-card status-card">
        <mat-slide-toggle [(ngModel)]="cryptoConfig.isActive" color="primary">
          {{ cryptoConfig.isActive ? 'Active' : 'Inactive' }}
        </mat-slide-toggle>

        <button mat-raised-button color="primary" (click)="saveConfig('CRYPTO')" [disabled]="saving">
          Save CRYPTO Configuration
        </button>
      </mat-card>
    </div>
  </mat-tab>
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npx ng build --configuration development`
Expected: build succeeds with no TypeScript errors in `bot-config.component.ts`/`.html`.

Start both dev servers and verify visually:
```bash
cd backend && npm run dev &
cd frontend && ng serve --port 4200 &
```
Use Playwright to navigate to `http://localhost:4200/bot-config`, inject CSS to hide `<app-ibkr-auth-gate>` (`page.addStyleTag({ content: 'app-ibkr-auth-gate { display: none !important; }' })`), screenshot at 390px (mobile) and 1280px (desktop) widths. Verify: three tabs visible (MX — BMV / USA — NYSE/Nasdaq / CRYPTO — Bitso), clicking the CRYPTO tab shows the same card layout as MX/USA with BTC_MXN/ETH_MXN symbol chips, no console errors. Verify the MX and USA tabs still render exactly as before (no visual regression). Stop both dev servers.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/bot-config/bot-config.component.ts frontend/src/app/bot-config/bot-config.component.html
git commit -m "feat: add CRYPTO tab to Bot Config"
```

---

### Task 4: Frontend — Dashboard CRYPTO tab

**Files:**
- Create: `frontend/src/app/core/models/crypto-portfolio.model.ts`
- Create: `frontend/src/app/core/services/crypto-portfolio.service.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.html`

**Interfaces:**
- Consumes: `GET /api/portfolio/crypto` (Task 1), `Market` (Task 2), `PnlService`/`BotService` (Task 2, already CRYPTO-aware).
- Produces: `CryptoPortfolioService.getPortfolio(): Observable<CryptoPortfolio>` — used only within this component.

- [ ] **Step 1: Create the crypto portfolio model and service**

```typescript
// frontend/src/app/core/models/crypto-portfolio.model.ts
export interface CryptoPosition {
  book: string;
  baseCurrency: string;
  quantity: number;
  lastPrice: number;
  mktValue: number;
}

export interface CryptoPortfolio {
  currency: 'MXN';
  availableFunds: number;
  netLiquidation: number;
  positions: CryptoPosition[];
}
```

```typescript
// frontend/src/app/core/services/crypto-portfolio.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CryptoPortfolio } from '../models/crypto-portfolio.model';

@Injectable({ providedIn: 'root' })
export class CryptoPortfolioService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getPortfolio(): Observable<CryptoPortfolio> {
    return this.http.get<CryptoPortfolio>(`${this.apiUrl}/portfolio/crypto`);
  }
}
```

- [ ] **Step 2: Widen the Dashboard component**

Replace the local `type Market = 'MX' | 'USA';` declaration (near the top of the file) with an import:

```typescript
import { Market } from '../core/models/market.model';
import { CryptoPortfolioService } from '../core/services/crypto-portfolio.service';
import { CryptoPortfolio } from '../core/models/crypto-portfolio.model';
```

(Remove the line `type Market = 'MX' | 'USA';`.)

Widen `marketOpen` and `pnlReports`, and add the new crypto-specific state fields:

```typescript
  marketOpen: { MX: boolean; USA: boolean; CRYPTO: boolean } = { MX: false, USA: false, CRYPTO: false };
  pnlReports: { MX: PnlReport | null; USA: PnlReport | null; CRYPTO: PnlReport | null } = { MX: null, USA: null, CRYPTO: null };

  cryptoPortfolio: CryptoPortfolio | null = null;
  cryptoLoading = true;
  cryptoError: string | null = null;
  cryptoPositionColumns = ['book', 'quantity', 'lastPrice', 'mktValue'];
```

Add `cryptoPortfolioService` to the constructor:

```typescript
  constructor(
    private portfolioService: PortfolioService,
    private botService: BotService,
    private orderService: OrderService,
    private pnlService: PnlService,
    private cryptoPortfolioService: CryptoPortfolioService,
  ) {}
```

Add a new polling subscription in `ngOnInit`, alongside the existing four (append after the last one, before the closing of the method):

```typescript
    // Poll crypto portfolio every 30s — separate from the IBKR portfolio
    // polling above since it's a distinct endpoint/data shape (Bitso has no
    // "market closed" concept, so this always polls, unlike the IBKR one).
    this.subs.add(
      interval(30_000).pipe(
        startWith(0),
        switchMap(() => this.cryptoPortfolioService.getPortfolio().pipe(
          catchError(err => {
            this.cryptoError = err.message;
            this.cryptoLoading = false;
            return EMPTY;
          })
        )),
      ).subscribe(portfolio => {
        this.cryptoPortfolio = portfolio;
        this.cryptoLoading = false;
        this.cryptoError = null;
      })
    );
```

Widen `loadPnl`:

```typescript
  loadPnl(): void {
    (['MX', 'USA', 'CRYPTO'] as const).forEach(market => {
      this.subs.add(
        this.pnlService.getReport(market).subscribe({
          next: report => { this.pnlReports[market] = report; },
        })
      );
    });
  }
```

Widen `onTabChange`:

```typescript
  onTabChange(index: number): void {
    if (index === 0) this.activeMarket = 'MX';
    else if (index === 1) this.activeMarket = 'USA';
    else this.activeMarket = 'CRYPTO';
  }
```

Widen `currency`:

```typescript
  get currency(): string {
    if (this.activeMarket === 'MX') return 'MXN';
    if (this.activeMarket === 'USA') return 'USD';
    return 'MXN';
  }
```

Simplify `toggleBot`'s fee fallback (the old `market === 'MX' ? 0.30 : 0.05` ternary had no CRYPTO branch — `config.feeEstimatePct` is always a real `number` on a loaded `BotConfig`, so no fallback value is actually needed):

```typescript
  toggleBot(running: boolean): void {
    const config = this.activeBotConfig;
    if (running && config) {
      this.subs.add(
        this.botService.startBot({
          market: this.activeMarket,
          symbols: config.symbols,
          capitalLimit: config.capitalLimit,
          intervalMin: config.intervalMin,
          confidenceThreshold: config.confidenceThreshold ?? 0.65,
          takeProfitPct: config.takeProfitPct ?? 1.5,
          stopLossPct: config.stopLossPct ?? 1.0,
          feeEstimatePct: config.feeEstimatePct,
        }).subscribe(() => this.loadBotStatus())
      );
    } else {
      this.subs.add(
        this.botService.stopBot(this.activeMarket)
          .subscribe(() => this.loadBotStatus())
      );
    }
  }
```

- [ ] **Step 3: Add the CRYPTO tab and its own template to the Dashboard HTML**

Add a third `<mat-tab>` inside the existing `<mat-tab-group>`:

```html
<mat-tab-group (selectedIndexChange)="onTabChange($event)">
  <mat-tab label="MX — BMV">
    <ng-container *ngTemplateOutlet="marketContent"></ng-container>
  </mat-tab>
  <mat-tab label="USA — NYSE/Nasdaq">
    <ng-container *ngTemplateOutlet="marketContent"></ng-container>
  </mat-tab>
  <mat-tab label="CRYPTO — Bitso">
    <ng-container *ngTemplateOutlet="cryptoContent"></ng-container>
  </mat-tab>
</mat-tab-group>
```

Leave the existing `<ng-template #marketContent>` block (MX/USA) completely untouched. Add a new, separate template after it (the crypto data shape — `CryptoPortfolio`, no chart, no pending orders — doesn't fit the existing IBKR-shaped template, so it gets its own, matching the "don't restructure existing tabs" principle):

```html
<ng-template #cryptoContent>
  <div *ngIf="cryptoLoading" class="loading-container">
    <mat-progress-spinner mode="indeterminate" diameter="48"></mat-progress-spinner>
  </div>

  <div *ngIf="cryptoError" class="error-card">
    <mat-icon>error</mat-icon>
    {{ cryptoError }} — check your Bitso API credentials are configured.
  </div>

  <div *ngIf="!cryptoLoading && !cryptoError" class="portfolio-status">
    <mat-icon class="status-icon open">wifi</mat-icon>
    <span>Live · updating every 30s · crypto trades 24/7, no market hours</span>
  </div>

  <div *ngIf="!cryptoLoading && !cryptoError && cryptoPortfolio" class="cards-row">
    <mat-card>
      <mat-card-header>
        <mat-card-title>Available Funds</mat-card-title>
        <mat-card-subtitle>MXN</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <p class="amount">{{ cryptoPortfolio.availableFunds | number:'1.2-2' }}</p>
      </mat-card-content>
    </mat-card>

    <mat-card>
      <mat-card-header>
        <mat-card-title>Net Liquidation</mat-card-title>
        <mat-card-subtitle>MXN</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <p class="amount">{{ cryptoPortfolio.netLiquidation | number:'1.2-2' }}</p>
      </mat-card-content>
    </mat-card>

    <mat-card *ngIf="pnlReports.CRYPTO as pnl">
      <mat-card-header>
        <mat-card-title>Session P&amp;L</mat-card-title>
        <mat-card-subtitle>{{ pnl.currency }} — realized today</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <p class="amount" [class.positive]="pnl.currentSessionRealizedPnl > 0" [class.negative]="pnl.currentSessionRealizedPnl < 0">
          {{ pnl.currentSessionRealizedPnl | number:'1.2-2' }}
        </p>
        <p class="pnl-subline">All-time: {{ pnl.allTimeRealizedPnl | number:'1.2-2' }} {{ pnl.currency }}</p>
      </mat-card-content>
    </mat-card>
  </div>

  <h2 *ngIf="cryptoPortfolio">Crypto Holdings</h2>
  <div class="table-scroll" *ngIf="cryptoPortfolio && cryptoPortfolio.positions.length > 0">
    <table mat-table [dataSource]="cryptoPortfolio.positions">
      <ng-container matColumnDef="book">
        <th mat-header-cell *matHeaderCellDef>Symbol</th>
        <td mat-cell *matCellDef="let row">{{ row.book | uppercase }}</td>
      </ng-container>
      <ng-container matColumnDef="quantity">
        <th mat-header-cell *matHeaderCellDef>Quantity</th>
        <td mat-cell *matCellDef="let row">{{ row.quantity }}</td>
      </ng-container>
      <ng-container matColumnDef="lastPrice">
        <th mat-header-cell *matHeaderCellDef>Last Price</th>
        <td mat-cell *matCellDef="let row">{{ row.lastPrice | number:'1.2-2' }} MXN</td>
      </ng-container>
      <ng-container matColumnDef="mktValue">
        <th mat-header-cell *matHeaderCellDef>Market Value</th>
        <td mat-cell *matCellDef="let row">{{ row.mktValue | number:'1.2-2' }} MXN</td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="cryptoPositionColumns"></tr>
      <tr mat-row *matRowDef="let row; columns: cryptoPositionColumns;"></tr>
    </table>
  </div>
  <div *ngIf="cryptoPortfolio && cryptoPortfolio.positions.length === 0" class="empty-state">
    No crypto symbols configured yet — add one in Bot Config.
  </div>
</ng-template>
```

Note: no `<app-symbol-chart>` section and no Pending Orders section for crypto — both are out of scope for this phase (no historical OHLC data source for crypto; Bitso market orders execute immediately with no pending state), matching the backend design spec's explicit Out-of-Scope list.

- [ ] **Step 4: Add the empty-state class if missing**

Check `dashboard.component.scss` for an `.empty-state` rule; if absent, add one matching the style already used on other pages (e.g. `trade-log.component.scss`):

```scss
.empty-state {
  color: var(--text-muted);
  padding: 24px 0;
}
```

- [ ] **Step 5: Verify**

Run: `cd frontend && npx ng build --configuration development`
Expected: build succeeds, no TypeScript errors.

Start both dev servers, Playwright-verify `http://localhost:4200/dashboard` at mobile (390px) and desktop (1280px): three tabs present, CRYPTO tab shows loading spinner then either data or a clean error card (no live Bitso credentials in this environment — an error card here is an expected, passing result, not a bug), no console errors, MX/USA tabs render exactly as before. Stop both dev servers.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/models/crypto-portfolio.model.ts frontend/src/app/core/services/crypto-portfolio.service.ts \
        frontend/src/app/dashboard/dashboard.component.ts frontend/src/app/dashboard/dashboard.component.html \
        frontend/src/app/dashboard/dashboard.component.scss
git commit -m "feat: add CRYPTO tab to Dashboard with a dedicated crypto portfolio view"
```

---

### Task 5: Frontend — Trade Log CRYPTO filter

**Files:**
- Modify: `frontend/src/app/trade-log/trade-log.component.ts`
- Modify: `frontend/src/app/trade-log/trade-log.component.html`

**Interfaces:**
- Consumes: `Market`, `TradeService`/`TradeFilters` (Task 2, already CRYPTO-aware).

- [ ] **Step 1: Widen marketFilter's type**

```typescript
import { Market } from '../core/models/market.model';
```

```typescript
  marketFilter: Market | '' = '';
```

Update `loadTrades`'s cast:

```typescript
  loadTrades(): void {
    this.loading = true;
    const filters: TradeFilters = {
      ...(this.marketFilter ? { market: this.marketFilter as Market } : {}),
      ...(this.symbolFilter ? { symbol: this.symbolFilter.toUpperCase() } : {}),
    };
    this.tradeService.getTrades(filters).subscribe({
      next: trades => { this.trades = trades; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }
```

- [ ] **Step 2: Add the CRYPTO option to both the desktop select and the mobile filter dialog**

In the desktop filter row (`<div class="filters-row" *ngIf="!isMobile">`'s Market `<mat-select>`), add one option after the USA option:

```html
    <mat-select [(ngModel)]="marketFilter" (ngModelChange)="loadTrades()">
      <mat-option value="">All</mat-option>
      <mat-option value="MX">MX — BMV</mat-option>
      <mat-option value="USA">USA — NYSE/Nasdaq</mat-option>
      <mat-option value="CRYPTO">CRYPTO — Bitso</mat-option>
    </mat-select>
```

Make the identical addition inside `<ng-template #filtersDialog>`'s Market `<mat-select>` (the mobile filter dialog has its own copy of this same select):

```html
      <mat-select [(ngModel)]="marketFilter" (ngModelChange)="loadTrades()">
        <mat-option value="">All</mat-option>
        <mat-option value="MX">MX — BMV</mat-option>
        <mat-option value="USA">USA — NYSE/Nasdaq</mat-option>
        <mat-option value="CRYPTO">CRYPTO — Bitso</mat-option>
      </mat-select>
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npx ng build --configuration development`
Expected: build succeeds.

Playwright-verify `http://localhost:4200/trade-log` at mobile and desktop: the Market select (desktop) and the filter dialog (mobile, via the filter icon button) both list CRYPTO — Bitso as a third option, selecting it doesn't error (returns an empty trade list, which is expected — no crypto trades exist yet in this environment), MX/USA filtering still works exactly as before.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/trade-log/trade-log.component.ts frontend/src/app/trade-log/trade-log.component.html
git commit -m "feat: add CRYPTO option to Trade Log market filter"
```

---

### Task 6: Frontend — Bot Logs CRYPTO filter

**Files:**
- Modify: `frontend/src/app/bot-logs/bot-logs-page.component.ts`
- Modify: `frontend/src/app/bot-logs/bot-logs-page.component.html`

**Interfaces:**
- Consumes: `Market`, `BotLogService` (Task 2, already CRYPTO-aware).

- [ ] **Step 1: Widen activeMarket's type**

```typescript
import { Market } from '../core/models/market.model';
```

```typescript
  activeMarket: 'all' | Market = 'all';
```

Widen `setMarket`:

```typescript
  setMarket(market: 'all' | Market): void {
    this.activeMarket = market;
    this.visibleCount = PAGE_SIZE;
    this.applyFilters();
  }
```

- [ ] **Step 2: Add the CRYPTO chip to both the desktop controls row and the mobile filter dialog**

In the desktop `<div class="controls" *ngIf="!isMobile">`'s Market `<mat-chip-set>`, add one chip after USA:

```html
      <mat-chip-set>
        <mat-chip [class.active]="activeMarket === 'all'" (click)="setMarket('all')">All</mat-chip>
        <mat-chip [class.active]="activeMarket === 'MX'" (click)="setMarket('MX')">MX</mat-chip>
        <mat-chip [class.active]="activeMarket === 'USA'" (click)="setMarket('USA')">USA</mat-chip>
        <mat-chip [class.active]="activeMarket === 'CRYPTO'" (click)="setMarket('CRYPTO')">CRYPTO</mat-chip>
      </mat-chip-set>
```

Make the identical addition inside `<ng-template #filtersDialog>`'s Market `<mat-chip-set>`:

```html
        <mat-chip-set>
          <mat-chip [class.active]="activeMarket === 'all'" (click)="setMarket('all')">All</mat-chip>
          <mat-chip [class.active]="activeMarket === 'MX'" (click)="setMarket('MX')">MX</mat-chip>
          <mat-chip [class.active]="activeMarket === 'USA'" (click)="setMarket('USA')">USA</mat-chip>
          <mat-chip [class.active]="activeMarket === 'CRYPTO'" (click)="setMarket('CRYPTO')">CRYPTO</mat-chip>
        </mat-chip-set>
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npx ng build --configuration development`
Expected: build succeeds.

Playwright-verify `http://localhost:4200/bot-logs` at mobile and desktop: CRYPTO chip present in both the desktop row and the mobile filter dialog, clicking it filters to an empty list without error (expected — no crypto bot logs exist yet), All/MX/USA filtering still works exactly as before.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/bot-logs/bot-logs-page.component.ts frontend/src/app/bot-logs/bot-logs-page.component.html
git commit -m "feat: add CRYPTO chip to Bot Logs market filter"
```

---

### Task 7: Frontend — Agent Logs + Request Examples CRYPTO support

**Files:**
- Modify: `frontend/src/app/core/models/agent-log.model.ts`
- Modify: `frontend/src/app/core/models/agent-request-preview.model.ts`
- Modify: `frontend/src/app/agent-logs/agent-logs-page.component.ts`
- Modify: `frontend/src/app/agent-logs/agent-logs-page.component.html`
- Modify: `frontend/src/app/agent-log/agent-log.component.ts`
- Modify: `frontend/src/app/request-examples/request-examples.component.ts`
- Modify: `frontend/src/app/request-examples/request-examples.component.html`

**Interfaces:**
- Consumes: `Market` (Task 2).
- Produces: `CryptoAgentLogIndicators`, the `StockAgentRequestPreview | CryptoAgentRequestPreview` discriminated union — both consumed only within this task's own files.

- [ ] **Step 1: Widen agent-log.model.ts for the crypto-shaped log payload**

The backend's `runCryptoAgentCycle` (already built) stores `marketData: { lastPrice, indicators }` for crypto logs — no `changePct`/`volume` fields at all (unlike the stock shape, which has both). Update the model to reflect this:

```typescript
// frontend/src/app/core/models/agent-log.model.ts
export interface AgentLogIndicators {
  rsi14: number;
  ma20: number;
  ma50: number;
  percentChange5d: number;
  volumeRatio: number;
}

export interface CryptoAgentLogIndicators {
  changePctSinceSnapshot: number | null;
  minutesSinceSnapshot: number | null;
  orderBookImbalance: number;
  spreadPct: number;
}

export interface AgentLogMarketData {
  lastPrice: number;
  changePct?: number;
  volume?: number;
  indicators: AgentLogIndicators | CryptoAgentLogIndicators;
}

export interface AgentLogResponse {
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  confidence: number;
  reason: string;
}

export interface AgentLog {
  id: string;
  createdAt: string;
  symbol: string;
  market: string;
  executed: boolean;
  marketData: AgentLogMarketData;
  response: AgentLogResponse;
}
```

- [ ] **Step 2: Split agent-request-preview.model.ts into a discriminated union**

The backend's `/api/agent/preview` returns two structurally different shapes depending on market (confirmed from the backend plan's Task 8: crypto's `readable` block has `changePct24h`/`volume24h`/`orderBookImbalance`/`spreadPct`/`changePctSinceSnapshot` instead of `changePct`/`volume`/`rsi14`/`ma20`/`ma50`/`percentChange5d`/`volumeRatio`):

```typescript
// frontend/src/app/core/models/agent-request-preview.model.ts
export interface StockAgentRequestPreview {
  symbol: string;
  market: 'MX' | 'USA';
  readable: {
    lastPrice: number;
    changePct: number;
    volume: number;
    currency: string;
    rsi14: number;
    ma20: number;
    ma50: number;
    percentChange5d: number;
    volumeRatio: number;
    capitalLimit: number | null;
    intervalMin: number;
    availableFunds: number;
    effectiveCapital: number;
    netLiquidation: number;
    totalUnrealizedPnl: number;
    currentPosition: number;
    currentAvgCost: number;
  };
  request: {
    model: string;
    max_tokens: number;
    system: string;
    messages: { role: string; content: string }[];
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
  request: {
    model: string;
    max_tokens: number;
    system: string;
    messages: { role: string; content: string }[];
  };
}

export type AgentRequestPreview = StockAgentRequestPreview | CryptoAgentRequestPreview;
```

- [ ] **Step 3: Widen agent-logs-page.component.ts and add the CRYPTO chip**

```typescript
import { Market } from '../core/models/market.model';
```

```typescript
  activeMarket: Market = 'MX';
```

```typescript
  setMarket(market: Market): void {
    this.activeMarket = market;
    this.loadStatus();
  }
```

Add the CRYPTO chip to `agent-logs-page.component.html`, after the USA chip:

```html
    <mat-chip-set>
      <mat-chip [class.active]="activeMarket === 'MX'" (click)="setMarket('MX')">MX — BMV</mat-chip>
      <mat-chip [class.active]="activeMarket === 'USA'" (click)="setMarket('USA')">USA — NYSE/Nasdaq</mat-chip>
      <mat-chip [class.active]="activeMarket === 'CRYPTO'" (click)="setMarket('CRYPTO')">CRYPTO — Bitso</mat-chip>
    </mat-chip-set>
```

- [ ] **Step 4: Make agent-log.component.ts's field rendering market-conditional**

Widen the `@Input() market` type, and convert the previously-static `inputFieldLabels`/`inputKeys` into getters that branch on the market (the stock branch's content/behavior is unchanged from today — it's just moved from a static field into the `else` side of a getter):

```typescript
import { Market } from '../core/models/market.model';
```

```typescript
  @Input() market: Market = 'MX';
```

Replace the existing `inputFieldLabels`/`inputKeys` fields with:

```typescript
  get inputFieldLabels(): Record<string, string> {
    if (this.market === 'CRYPTO') {
      return {
        lastPrice: 'Last Price (MXN)',
        changePctSinceSnapshot: 'Change Since Last Check',
        orderBookImbalance: 'Order Book Imbalance',
        spreadPct: 'Bid/Ask Spread',
      };
    }
    return {
      lastPrice: 'Last Price',
      changePct: 'Day Change %',
      volume: 'Volume',
      rsi14: 'RSI (14)',
      ma20: 'MA20',
      ma50: 'MA50',
      percentChange5d: '5d Change %',
      volumeRatio: 'Volume Ratio',
    };
  }

  get inputKeys(): string[] {
    return Object.keys(this.inputFieldLabels);
  }
```

Replace `getFieldValue` with a market-conditional version:

```typescript
  getFieldValue(log: AgentLog, key: string): string {
    const md = log.marketData;
    const ind = md?.indicators as Record<string, number | null | undefined> | undefined;

    if (this.market === 'CRYPTO') {
      const map: Record<string, string> = {
        lastPrice: md?.lastPrice != null ? `${md.lastPrice.toFixed(2)} MXN` : '—',
        changePctSinceSnapshot: ind?.['changePctSinceSnapshot'] != null
          ? `${(ind['changePctSinceSnapshot'] as number) >= 0 ? '+' : ''}${(ind['changePctSinceSnapshot'] as number).toFixed(2)}%`
          : 'insufficient history yet',
        orderBookImbalance: ind?.['orderBookImbalance'] != null ? (ind['orderBookImbalance'] as number).toFixed(2) : '—',
        spreadPct: ind?.['spreadPct'] != null ? `${(ind['spreadPct'] as number).toFixed(3)}%` : '—',
      };
      return map[key] ?? '—';
    }

    const map: Record<string, string> = {
      lastPrice: md?.lastPrice != null ? md.lastPrice.toFixed(2) : '—',
      changePct: md?.changePct != null ? `${md.changePct >= 0 ? '+' : ''}${md.changePct.toFixed(2)}%` : '—',
      volume: md?.volume != null ? md.volume.toLocaleString() : '—',
      rsi14: ind?.['rsi14'] != null ? (ind['rsi14'] as number).toFixed(2) : '—',
      ma20: ind?.['ma20'] != null ? (ind['ma20'] as number).toFixed(2) : '—',
      ma50: ind?.['ma50'] != null ? (ind['ma50'] as number).toFixed(2) : '—',
      percentChange5d: ind?.['percentChange5d'] != null ? `${(ind['percentChange5d'] as number) >= 0 ? '+' : ''}${(ind['percentChange5d'] as number).toFixed(2)}%` : '—',
      volumeRatio: ind?.['volumeRatio'] != null ? `${(ind['volumeRatio'] as number).toFixed(2)}x` : '—',
    };
    return map[key] ?? '—';
  }
```

No changes needed to `agent-log.component.html` — it already renders `inputKeys`/`inputFieldLabels`/`getFieldValue` generically via `*ngFor="let key of inputKeys"`, and `{{ log.market }}` already displays whatever string the backend sends.

- [ ] **Step 5: Add the CRYPTO slot and market-conditional rendering to Request Examples**

```typescript
import { Market } from '../core/models/market.model';
```

Widen `PreviewSlot.market` and add the third slot:

```typescript
interface PreviewSlot {
  market: Market;
  label: string;
  preview: AgentRequestPreview | null;
  error: string | null;
}
```

```typescript
  slots: PreviewSlot[] = [
    { market: 'MX', label: 'MX — BMV', preview: null, error: null },
    { market: 'USA', label: 'USA — NYSE/Nasdaq', preview: null, error: null },
    { market: 'CRYPTO', label: 'CRYPTO — Bitso', preview: null, error: null },
  ];
```

Replace `readableRows` with a market-conditional version, using the discriminated union from Step 2 to narrow `preview.readable`'s type per branch:

```typescript
  readableRows(preview: AgentRequestPreview): ReadableRow[] {
    const r = preview.readable;
    const currency = r.currency;

    if (preview.market === 'CRYPTO') {
      return [
        { label: 'Symbol', value: preview.symbol },
        { label: 'Last Price', value: `${r.lastPrice.toFixed(2)} ${currency}` },
        { label: '24h Change', value: `${r.changePct24h >= 0 ? '+' : ''}${r.changePct24h.toFixed(2)}%` },
        { label: '24h Volume', value: r.volume24h.toLocaleString() },
        { label: 'Order Book Imbalance', value: r.orderBookImbalance.toFixed(2) },
        { label: 'Bid/Ask Spread', value: `${r.spreadPct.toFixed(3)}%` },
        { label: 'Change Since Last Check', value: r.changePctSinceSnapshot != null ? `${r.changePctSinceSnapshot >= 0 ? '+' : ''}${r.changePctSinceSnapshot.toFixed(2)}%` : 'insufficient history yet' },
        { label: 'Capital Limit', value: r.capitalLimit != null ? `${r.capitalLimit.toFixed(2)} ${currency}` : 'not set' },
        { label: 'Check Frequency', value: `every ${r.intervalMin} min` },
        { label: 'Available Funds', value: `${r.availableFunds.toFixed(2)} ${currency}` },
        { label: 'Effective Capital', value: `${r.effectiveCapital.toFixed(2)} ${currency}` },
        { label: 'Net Liquidation', value: `${r.netLiquidation.toFixed(2)} ${currency}` },
        { label: 'Total Unrealized P&L', value: `${r.totalUnrealizedPnl >= 0 ? '+' : ''}${r.totalUnrealizedPnl.toFixed(2)} ${currency}` },
        { label: 'Current Position', value: r.currentPosition > 0 ? `${r.currentPosition} @ ${r.currentAvgCost.toFixed(2)} ${currency}` : 'none' },
      ];
    }

    return [
      { label: 'Symbol', value: preview.symbol },
      { label: 'Last Price', value: `${r.lastPrice.toFixed(2)} ${currency}` },
      { label: 'Day Change', value: `${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(2)}%` },
      { label: 'Volume', value: r.volume.toLocaleString() },
      { label: 'RSI (14)', value: r.rsi14.toFixed(2) },
      { label: 'MA20', value: `${r.ma20.toFixed(2)} ${currency}` },
      { label: 'MA50', value: `${r.ma50.toFixed(2)} ${currency}` },
      { label: '5-Day Change', value: `${r.percentChange5d >= 0 ? '+' : ''}${r.percentChange5d.toFixed(2)}%` },
      { label: 'Volume Ratio', value: `${r.volumeRatio.toFixed(2)}x` },
      { label: 'Capital Limit', value: r.capitalLimit != null ? `${r.capitalLimit.toFixed(2)} ${currency}` : 'not set' },
      { label: 'Check Frequency', value: `every ${r.intervalMin} min` },
      { label: 'Available Funds', value: `${r.availableFunds.toFixed(2)} ${currency}` },
      { label: 'Effective Capital', value: `${r.effectiveCapital.toFixed(2)} ${currency}` },
      { label: 'Net Liquidation', value: `${r.netLiquidation.toFixed(2)} ${currency}` },
      { label: 'Total Unrealized P&L', value: `${r.totalUnrealizedPnl >= 0 ? '+' : ''}${r.totalUnrealizedPnl.toFixed(2)} ${currency}` },
      { label: 'Current Position', value: r.currentPosition > 0 ? `${r.currentPosition} shares @ ${r.currentAvgCost.toFixed(2)} ${currency}` : 'none' },
    ];
  }
```

`requestJson(preview)` needs no change — it already generically stringifies `preview.request`, which has the same shape on both sides of the union. No changes needed to `request-examples.component.html` — it already renders `slots`/`readableRows`/`requestJson` generically.

- [ ] **Step 6: Verify**

Run: `cd frontend && npx ng build --configuration development`
Expected: build succeeds — this step in particular will surface any place the discriminated union isn't narrowed correctly (TypeScript errors on `r.rsi14` etc. if the `if (preview.market === 'CRYPTO')` branch isn't structured correctly).

Playwright-verify `http://localhost:4200/agent-logs` at mobile and desktop: three chips present (MX/USA/CRYPTO), clicking CRYPTO shows an empty state (expected — no crypto agent logs exist yet) without error, expanding "Requests example" shows three slots including CRYPTO — Bitso (which will show its error message since there's no live Bitso connection in this environment — an error card here is expected, not a bug), MX/USA panels render exactly as before with their full RSI/MA/volume-ratio field list.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/core/models/agent-log.model.ts frontend/src/app/core/models/agent-request-preview.model.ts \
        frontend/src/app/agent-logs/agent-logs-page.component.ts frontend/src/app/agent-logs/agent-logs-page.component.html \
        frontend/src/app/agent-log/agent-log.component.ts \
        frontend/src/app/request-examples/request-examples.component.ts frontend/src/app/request-examples/request-examples.component.html
git commit -m "feat: add CRYPTO support to Agent Logs and Request Examples"
```

---

### Task 8: Frontend — PnL History CRYPTO tab

**Files:**
- Modify: `frontend/src/app/pnl-history/pnl-history.component.ts`
- Modify: `frontend/src/app/pnl-history/pnl-history.component.html`

**Interfaces:**
- Consumes: `Market`, `PnlService` (Task 2, already CRYPTO-aware).

- [ ] **Step 1: Widen the component**

Replace the local `type Market = 'MX' | 'USA';` with an import:

```typescript
import { Market } from '../core/models/market.model';
```

(Remove the line `type Market = 'MX' | 'USA';`.)

```typescript
  activeMarket: Market = 'MX';
  reports: { MX: PnlReport | null; USA: PnlReport | null; CRYPTO: PnlReport | null } = { MX: null, USA: null, CRYPTO: null };
```

```typescript
  loadReports(): void {
    this.loading = true;
    let remaining = 3;
    (['MX', 'USA', 'CRYPTO'] as const).forEach(market => {
      this.pnlService.getReport(market).subscribe({
        next: report => {
          this.reports[market] = report;
          remaining -= 1;
          if (remaining <= 0) this.loading = false;
        },
        error: () => {
          remaining -= 1;
          if (remaining <= 0) this.loading = false;
        },
      });
    });
  }
```

```typescript
  onTabChange(index: number): void {
    this.activeMarket = index === 0 ? 'MX' : index === 1 ? 'USA' : 'CRYPTO';
  }
```

- [ ] **Step 2: Add the third tab**

```html
<mat-tab-group (selectedIndexChange)="onTabChange($event)">
  <mat-tab label="MX — BMV">
    <ng-container *ngTemplateOutlet="marketContent"></ng-container>
  </mat-tab>
  <mat-tab label="USA — NYSE/Nasdaq">
    <ng-container *ngTemplateOutlet="marketContent"></ng-container>
  </mat-tab>
  <mat-tab label="CRYPTO — Bitso">
    <ng-container *ngTemplateOutlet="marketContent"></ng-container>
  </mat-tab>
</mat-tab-group>
```

The existing `<ng-template #marketContent>` is already fully generic (reads `report.currency`/`report.currentSessionRealizedPnl`/`report.days` — all present identically on a CRYPTO `PnlReport`, since `pnl.ts`'s `getPnlReport` is already market-agnostic from the backend plan) — it needs no changes at all and is reused as-is for all three tabs.

- [ ] **Step 3: Verify**

Run: `cd frontend && npx ng build --configuration development`
Expected: build succeeds.

Playwright-verify `http://localhost:4200/pnl-history` at mobile and desktop: three tabs present, CRYPTO tab shows the same card/table layout as MX/USA (empty state since no crypto trades exist yet — expected), MX/USA tabs render exactly as before.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pnl-history/pnl-history.component.ts frontend/src/app/pnl-history/pnl-history.component.html
git commit -m "feat: add CRYPTO tab to PnL History"
```

---

### Task 9: Final verification

**Files:** none (verification only).

**Interfaces:** none — this task exercises everything built in Tasks 1-8.

- [ ] **Step 1: Full backend type check**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Full frontend build**

Run: `cd frontend && npx ng build --configuration development`
Expected: build succeeds with zero errors.

- [ ] **Step 3: Backend regression check**

Run: `cd backend && npx jest`
Expected: same result as the backend plan's Task 13 — 79/81 passing, the 2 `databursatil.test.ts` failures pre-existing and unrelated (this UI work touches no backend test-covered file except `bot/logs/route.ts`'s one-line whitelist change and the new portfolio endpoint, neither of which has or needs a dedicated test).

- [ ] **Step 4: Manual crypto portfolio endpoint smoke test**

```bash
cd backend && npm run dev &
curl -s http://localhost:3000/api/portfolio/crypto | python3 -m json.tool
```
Expected: either a 200 with `{"currency":"MXN","availableFunds":0,"netLiquidation":0,"positions":[]}` (no CRYPTO BotConfig row saved yet) or a 500 with a clear error message (no real Bitso credentials in this environment) — both are acceptable, confirming the route is wired and doesn't crash the server.

- [ ] **Step 5: Full visual pass across all 6 pages**

Start both dev servers:
```bash
cd backend && npm run dev &
cd frontend && ng serve --port 4200 &
```

For each of Dashboard, Bot Config, Trade Log, Bot Logs, Agent Logs, PnL History: navigate via Playwright, inject CSS to hide `<app-ibkr-auth-gate>`, screenshot at 390px and 1280px widths, verify:
- The new CRYPTO tab/chip/option is present and visually consistent with the existing MX/USA ones (same card styling, same spacing, same typography).
- Selecting/clicking it doesn't throw a console error, even when the underlying data call fails (no live Bitso credentials) — a clean error/empty state is the expected, passing outcome.
- Switching back to MX or USA after visiting CRYPTO still shows exactly the same MX/USA content as before this plan — no state leakage, no layout shift, no regression.

- [ ] **Step 6: Commit (only if Step 5 surfaced a fix)**

```bash
git add -A
git commit -m "fix: address findings from crypto frontend visual verification pass"
```

Only run this step if Steps 1-5 required a code change; otherwise Task 8's commit is the last one for this plan.

---

## Self-Review

**Spec coverage** (against the design spec's Section 7 and the backend plan's own closing note that frontend is a separate follow-up):
- "Every page that currently has an MX/USA tab pair gets a third tab" → Tasks 3-8 cover Bot Config, Dashboard, Trade Log, Bot Logs, Agent Logs, PnL History — all six. ✅
- "Copy the pattern, do not restructure the existing two tabs" → verified per-task: every existing template block (`#marketContent` in Dashboard/PnL History, the MX/USA `<mat-tab>` blocks in Bot Config, the existing filter rows in Trade Log/Bot Logs/Agent Logs) is left untouched; new content is additive (`#cryptoContent` template, new `<mat-tab>`/`<mat-option>`/`<mat-chip>` elements). ✅
- "Bot Config's crypto tab fields: symbols, capital limit (MXN), check frequency, confidence threshold, take-profit/stop-loss — all reused as-is. Fee estimate default comes from Bitso's real fee schedule" → Task 3's fields match exactly; the "real fee schedule" behavior is backend logic already implemented (the final review's Fix 2 in the backend plan), the frontend field is just the user-editable override, matching the spec's own phrasing ("though the field stays user-editable like the other two markets"). ✅
- Dashboard's funds/positions gap (not explicitly addressed in the spec's brief Section 7, discovered during this plan's own file-reading pass) → resolved via the user's explicit choice (small new balances endpoint) in Task 1 + Task 4. ✅

**Placeholder scan:** no `TBD`/`TODO`/"implement later"/"similar to Task N" found — every step has complete, copy-pasteable code or an exact command with expected output.

**Type consistency check:** `Market` (Task 2) is the single import used everywhere a market discriminator's type needed widening across every subsequent task — no file redeclares its own local union after Task 2 touches it (Dashboard's and PnL History's local `type Market = 'MX' | 'USA';` are explicitly removed, not left dangling). `CryptoPortfolio`/`CryptoPosition` (Task 1 backend, Task 4 frontend) field names match exactly between the API route's response shape and the frontend model/template (`currency`, `availableFunds`, `netLiquidation`, `positions[].book/quantity/lastPrice/mktValue`). `StockAgentRequestPreview`/`CryptoAgentRequestPreview` (Task 7) field names match the backend's actual built shapes from the backend plan's Task 8, not the spec's earlier draft naming (e.g. `changePct24h` not `changePct`, `orderBookImbalance`/`spreadPct` not a generic "indicators" object) — grounded in the real, already-implemented backend response, not the design spec's higher-level sketch.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-08-crypto-trading-bitso-frontend.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
