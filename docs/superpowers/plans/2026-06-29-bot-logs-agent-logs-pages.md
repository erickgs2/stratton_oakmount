# Bot Logs Page + Agent Logs Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live Bot Logs page (unified operational + AI decision feed with search/filter), promote Agent Logs from a dashboard tab to a dedicated sidenav page, and instrument the backend to persist operational events.

**Architecture:** A new `BotLog` Prisma model stores operational events written by 5 instrumentation points across existing backend routes and the agent cycle. A new `/api/bot/logs` GET endpoint serves these logs. Two new Angular standalone component pages (`BotLogsPageComponent`, `AgentLogsPageComponent`) are added as lazy-loaded routes and sidenav entries. The Agent Logs tab is removed from the dashboard.

**Tech Stack:** Next.js 14 App Router, Prisma ORM + PostgreSQL, Angular 17 standalone components, Angular Material, RxJS (interval + startWith + switchMap).

## Global Constraints

- Angular 17 standalone components only — no NgModules
- All HTTP subscriptions must be added to a `Subscription` instance and unsubscribed in `ngOnDestroy`
- Polling uses `interval(N).pipe(startWith(0), switchMap(...))` — same pattern as existing services
- Backend query params validated with 400 on invalid values; limit clamped to 1–500
- `writeBotLog` must never throw — wrap in try/catch internally
- All new Angular Material modules imported explicitly in component `imports` array
- SCSS colors match existing dark theme: background `#121212`, surface `#1e1e1e`, border `#2a2a2a`
- Backend base: `backend/`, Frontend base: `frontend/src/app/`

---

## File Map

**Create:**
- `backend/lib/bot-logger.ts` — `writeBotLog` helper wrapping `prisma.botLog.create`
- `backend/app/api/bot/logs/route.ts` — GET `/api/bot/logs`
- `frontend/src/app/core/models/bot-log.model.ts` — `BotLog` interface
- `frontend/src/app/core/services/bot-log.service.ts` — `BotLogService.getLogs()`
- `frontend/src/app/bot-logs/bot-logs-page.component.ts`
- `frontend/src/app/bot-logs/bot-logs-page.component.html`
- `frontend/src/app/bot-logs/bot-logs-page.component.scss`
- `frontend/src/app/agent-logs/agent-logs-page.component.ts`
- `frontend/src/app/agent-logs/agent-logs-page.component.html`
- `frontend/src/app/agent-logs/agent-logs-page.component.scss`

**Modify:**
- `backend/prisma/schema.prisma` — add `BotLog` model
- `backend/app/api/bot/start/route.ts` — add `bot_started` + `cycle_error` logs
- `backend/app/api/bot/stop/route.ts` — add `bot_stopped` log
- `backend/lib/claude-agent.ts` — add `cycle_complete` + `order_placed` logs
- `frontend/src/app/app.routes.ts` — add 2 routes
- `frontend/src/app/app.component.html` — add 2 sidenav entries
- `frontend/src/app/dashboard/dashboard.component.ts` — remove `AgentLogComponent`
- `frontend/src/app/dashboard/dashboard.component.html` — remove Agent Logs tab

---

### Task 1: BotLog Prisma model + `/api/bot/logs` endpoint

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/lib/bot-logger.ts`
- Create: `backend/app/api/bot/logs/route.ts`

**Interfaces:**
- Produces: `writeBotLog(entry: BotLogEntry): Promise<void>` — used by Tasks 2
- Produces: `GET /api/bot/logs?market=&level=&limit=` → `{ logs: BotLog[] }` — used by Task 3

- [ ] **Step 1: Add `BotLog` model to schema**

Open `backend/prisma/schema.prisma`. Append this model at the end of the file:

```prisma
model BotLog {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  level     String
  event     String
  market    String?
  symbol    String?
  message   String
  meta      Json?
}
```

- [ ] **Step 2: Run the migration**

```bash
cd backend
npx prisma migrate dev --name add_bot_log
```

Expected output includes:
```
The following migration(s) have been applied:
  migrations/XXXXXXXX_add_bot_log/migration.sql
```

If the DATABASE_URL error appears, check that `backend/.env.local` has the correct `DATABASE_URL`. Run with: `DATABASE_URL="postgresql://..." npx prisma migrate dev --name add_bot_log`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 4: Create `backend/lib/bot-logger.ts`**

```typescript
import { prisma } from '@/lib/prisma';

interface BotLogEntry {
  level: 'info' | 'warn' | 'error';
  event: 'bot_started' | 'bot_stopped' | 'cycle_error' | 'cycle_complete' | 'order_placed';
  market?: string;
  symbol?: string;
  message: string;
  meta?: Record<string, unknown>;
}

export async function writeBotLog(entry: BotLogEntry): Promise<void> {
  try {
    await prisma.botLog.create({ data: entry });
  } catch (err) {
    console.error('[BotLogger] Failed to write log:', (err as Error).message);
  }
}
```

- [ ] **Step 5: Create `backend/app/api/bot/logs/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const VALID_MARKETS = ['MX', 'USA'];
const VALID_LEVELS = ['info', 'warn', 'error'];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const rawMarket = searchParams.get('market');
  if (rawMarket && !VALID_MARKETS.includes(rawMarket)) {
    return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  }

  const rawLevel = searchParams.get('level');
  if (rawLevel && !VALID_LEVELS.includes(rawLevel)) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }

  const limitParam = parseInt(searchParams.get('limit') ?? '200', 10);
  const limit = Number.isNaN(limitParam) ? 200 : Math.min(Math.max(1, limitParam), 500);

  const logs = await prisma.botLog.findMany({
    where: {
      ...(rawMarket ? { market: rawMarket } : {}),
      ...(rawLevel ? { level: rawLevel } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ logs });
}
```

- [ ] **Step 6: Verify the endpoint**

With the backend running (`npm run dev` in `backend/`):

```bash
curl -s http://localhost:3000/api/bot/logs | jq '{count: (.logs | length), first: .logs[0]}'
```

Expected: `{ "count": 0, "first": null }` (empty — no logs yet)

```bash
curl -s "http://localhost:3000/api/bot/logs?market=BAD" | jq .
```

Expected: `{ "error": "Invalid market" }` with HTTP 400

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/lib/bot-logger.ts backend/app/api/bot/logs/route.ts
git commit -m "feat: add BotLog model and /api/bot/logs endpoint"
```

---

### Task 2: Instrument backend with operational log events

**Files:**
- Modify: `backend/app/api/bot/start/route.ts`
- Modify: `backend/app/api/bot/stop/route.ts`
- Modify: `backend/lib/claude-agent.ts`

**Interfaces:**
- Consumes: `writeBotLog` from `@/lib/bot-logger` (Task 1)

- [ ] **Step 1: Instrument `backend/app/api/bot/start/route.ts`**

The current file is:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runAgentCycle } from '@/lib/claude-agent';
import { ibkrClient } from '@/lib/ibkr';

declare global {
  // eslint-disable-next-line no-var
  var botIntervals: Map<string, NodeJS.Timeout>;
}
global.botIntervals = global.botIntervals ?? new Map();

export async function POST(request: NextRequest) {
  const body = await request.json() as { market: 'MX' | 'USA'; symbols: string[]; capitalLimit: number; intervalMin: number };
  const { market, symbols, capitalLimit, intervalMin } = body;

  const config = await prisma.botConfig.upsert({
    where: { market },
    create: { market, symbols, capitalLimit, intervalMin, isActive: true },
    update: { symbols, capitalLimit, intervalMin, isActive: true },
  });

  ibkrClient.startKeepAlive();

  const intervalKey = `bot-${market}`;
  if (global.botIntervals.has(intervalKey)) {
    clearInterval(global.botIntervals.get(intervalKey));
  }

  const interval = setInterval(async () => {
    for (const symbol of symbols) {
      try {
        await runAgentCycle(symbol, market, capitalLimit);
      } catch (err) {
        console.error(`[Bot] Agent cycle error for ${symbol}:`, (err as Error).message);
      }
    }
  }, intervalMin * 60_000);

  global.botIntervals.set(intervalKey, interval);

  return NextResponse.json({ status: 'started', config });
}
```

Replace the entire file with:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runAgentCycle } from '@/lib/claude-agent';
import { ibkrClient } from '@/lib/ibkr';
import { writeBotLog } from '@/lib/bot-logger';

declare global {
  // eslint-disable-next-line no-var
  var botIntervals: Map<string, NodeJS.Timeout>;
}
global.botIntervals = global.botIntervals ?? new Map();

export async function POST(request: NextRequest) {
  const body = await request.json() as { market: 'MX' | 'USA'; symbols: string[]; capitalLimit: number; intervalMin: number };
  const { market, symbols, capitalLimit, intervalMin } = body;

  const config = await prisma.botConfig.upsert({
    where: { market },
    create: { market, symbols, capitalLimit, intervalMin, isActive: true },
    update: { symbols, capitalLimit, intervalMin, isActive: true },
  });

  await writeBotLog({
    level: 'info',
    event: 'bot_started',
    market,
    message: `Bot started for ${market} — ${symbols.slice(0, 2).join(', ')}${symbols.length > 2 ? ` (+${symbols.length - 2} more)` : ''}`,
  });

  ibkrClient.startKeepAlive();

  const intervalKey = `bot-${market}`;
  if (global.botIntervals.has(intervalKey)) {
    clearInterval(global.botIntervals.get(intervalKey));
  }

  const interval = setInterval(async () => {
    for (const symbol of symbols) {
      try {
        await runAgentCycle(symbol, market, capitalLimit);
      } catch (err) {
        console.error(`[Bot] Agent cycle error for ${symbol}:`, (err as Error).message);
        await writeBotLog({
          level: 'error',
          event: 'cycle_error',
          market,
          symbol,
          message: (err as Error).message,
        });
      }
    }
  }, intervalMin * 60_000);

  global.botIntervals.set(intervalKey, interval);

  return NextResponse.json({ status: 'started', config });
}
```

- [ ] **Step 2: Instrument `backend/app/api/bot/stop/route.ts`**

The current file is:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ibkrClient } from '@/lib/ibkr';

export async function POST(request: NextRequest) {
  const body = await request.json() as { market: 'MX' | 'USA' };
  const { market } = body;

  await prisma.botConfig.upsert({
    where: { market },
    create: { market, symbols: [], capitalLimit: 0, intervalMin: 1, isActive: false },
    update: { isActive: false },
  });

  const intervalKey = `bot-${market}`;
  if (global.botIntervals?.has(intervalKey)) {
    clearInterval(global.botIntervals.get(intervalKey));
    global.botIntervals.delete(intervalKey);
  }

  ibkrClient.stopKeepAlive();

  return NextResponse.json({ status: 'stopped', market });
}
```

Replace with:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ibkrClient } from '@/lib/ibkr';
import { writeBotLog } from '@/lib/bot-logger';

export async function POST(request: NextRequest) {
  const body = await request.json() as { market: 'MX' | 'USA' };
  const { market } = body;

  await prisma.botConfig.upsert({
    where: { market },
    create: { market, symbols: [], capitalLimit: 0, intervalMin: 1, isActive: false },
    update: { isActive: false },
  });

  const intervalKey = `bot-${market}`;
  if (global.botIntervals?.has(intervalKey)) {
    clearInterval(global.botIntervals.get(intervalKey));
    global.botIntervals.delete(intervalKey);
  }

  ibkrClient.stopKeepAlive();

  await writeBotLog({
    level: 'info',
    event: 'bot_stopped',
    market,
    message: `Bot stopped for ${market}`,
  });

  return NextResponse.json({ status: 'stopped', market });
}
```

- [ ] **Step 3: Instrument `backend/lib/claude-agent.ts`**

Add the import at the top of the file (after the existing imports):
```typescript
import { writeBotLog } from '@/lib/bot-logger';
```

Find the block that places an order (inside `if (conid) {`):
```typescript
    if (conid) {
      ibkrOrderId = await ibkrClient.placeOrder({
        conid,
        side: decision.action === 'buy' ? 'BUY' : 'SELL',
        quantity: decision.quantity,
        market,
      });
      executed = true;
    }
```

Replace with:
```typescript
    if (conid) {
      ibkrOrderId = await ibkrClient.placeOrder({
        conid,
        side: decision.action === 'buy' ? 'BUY' : 'SELL',
        quantity: decision.quantity,
        market,
      });
      executed = true;
      await writeBotLog({
        level: 'info',
        event: 'order_placed',
        market,
        symbol,
        message: `${symbol} ${decision.action.toUpperCase()} x${decision.quantity} @ ${lastPrice.toFixed(2)} ${market === 'MX' ? 'MXN' : 'USD'} — order #${ibkrOrderId}`,
      });
    }
```

Find the `prisma.agentLog.create` call:
```typescript
  await prisma.agentLog.create({
    data: {
      symbol,
      market,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      marketData: JSON.parse(JSON.stringify(marketData)),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: JSON.parse(JSON.stringify(decision)),
      executed,
    },
  });
```

Add the `cycle_complete` log immediately after it:
```typescript
  await prisma.agentLog.create({
    data: {
      symbol,
      market,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      marketData: JSON.parse(JSON.stringify(marketData)),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: JSON.parse(JSON.stringify(decision)),
      executed,
    },
  });

  await writeBotLog({
    level: 'info',
    event: 'cycle_complete',
    market,
    symbol,
    message: `${symbol} → ${decision.action.toUpperCase()} x${decision.quantity} (confidence ${decision.confidence.toFixed(2)})`,
    meta: { action: decision.action, quantity: decision.quantity, confidence: decision.confidence },
  });
```

- [ ] **Step 4: Verify instrumentation**

Toggle the bot ON then OFF in the UI (or via curl):
```bash
curl -s -X POST http://localhost:3000/api/bot/stop -H "Content-Type: application/json" -d '{"market":"MX"}'
curl -s -X POST http://localhost:3000/api/bot/start -H "Content-Type: application/json" \
  -d '{"market":"MX","symbols":["AMXL"],"capitalLimit":10000,"intervalMin":1}'
curl -s -X POST http://localhost:3000/api/bot/stop -H "Content-Type: application/json" -d '{"market":"MX"}'
```

Then check:
```bash
curl -s http://localhost:3000/api/bot/logs | jq '.logs[] | {event, level, message}'
```

Expected output includes entries with `bot_started` and `bot_stopped` events.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/bot/start/route.ts backend/app/api/bot/stop/route.ts backend/lib/claude-agent.ts
git commit -m "feat: instrument bot start/stop/cycle with BotLog events"
```

---

### Task 3: BotLog frontend model + service + Bot Logs page

**Files:**
- Create: `frontend/src/app/core/models/bot-log.model.ts`
- Create: `frontend/src/app/core/services/bot-log.service.ts`
- Create: `frontend/src/app/bot-logs/bot-logs-page.component.ts`
- Create: `frontend/src/app/bot-logs/bot-logs-page.component.html`
- Create: `frontend/src/app/bot-logs/bot-logs-page.component.scss`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.component.html`

**Interfaces:**
- Consumes: `GET /api/bot/logs` (Task 1)
- Produces: `/bot-logs` route rendering `BotLogsPageComponent`

- [ ] **Step 1: Create `frontend/src/app/core/models/bot-log.model.ts`**

```typescript
export interface BotLog {
  id: string;
  createdAt: string;
  level: 'info' | 'warn' | 'error';
  event: 'bot_started' | 'bot_stopped' | 'cycle_error' | 'cycle_complete' | 'order_placed';
  market: string | null;
  symbol: string | null;
  message: string;
  meta: Record<string, unknown> | null;
}
```

- [ ] **Step 2: Create `frontend/src/app/core/services/bot-log.service.ts`**

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BotLog } from '../models/bot-log.model';

@Injectable({ providedIn: 'root' })
export class BotLogService {
  private readonly apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getLogs(params: { market?: 'MX' | 'USA'; level?: 'info' | 'warn' | 'error'; limit?: number } = {}): Observable<{ logs: BotLog[] }> {
    let httpParams = new HttpParams();
    if (params.market) httpParams = httpParams.set('market', params.market);
    if (params.level) httpParams = httpParams.set('level', params.level);
    if (params.limit != null) httpParams = httpParams.set('limit', params.limit.toString());
    return this.http.get<{ logs: BotLog[] }>(`${this.apiUrl}/bot/logs`, { params: httpParams });
  }
}
```

- [ ] **Step 3: Create `frontend/src/app/bot-logs/bot-logs-page.component.ts`**

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription, interval } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import { BotLogService } from '../core/services/bot-log.service';
import { BotLog } from '../core/models/bot-log.model';

@Component({
  selector: 'app-bot-logs-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatIconModule,
    MatButtonModule, MatChipsModule, MatProgressSpinnerModule,
  ],
  templateUrl: './bot-logs-page.component.html',
  styleUrls: ['./bot-logs-page.component.scss'],
})
export class BotLogsPageComponent implements OnInit, OnDestroy {
  allLogs: BotLog[] = [];
  filteredLogs: BotLog[] = [];
  loading = true;

  searchTerm = '';
  activeLevel: 'all' | 'info' | 'warn' | 'error' = 'all';
  activeMarket: 'all' | 'MX' | 'USA' = 'all';

  private sub = new Subscription();

  constructor(private botLogService: BotLogService) {}

  ngOnInit(): void {
    this.sub.add(
      interval(10_000).pipe(
        startWith(0),
        switchMap(() => this.botLogService.getLogs({ limit: 200 })),
      ).subscribe({
        next: ({ logs }) => {
          this.allLogs = logs;
          this.loading = false;
          this.applyFilters();
        },
        error: () => { this.loading = false; },
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  setLevel(level: 'all' | 'info' | 'warn' | 'error'): void {
    this.activeLevel = level;
    this.applyFilters();
  }

  setMarket(market: 'all' | 'MX' | 'USA'): void {
    this.activeMarket = market;
    this.applyFilters();
  }

  applyFilters(): void {
    const term = this.searchTerm.toLowerCase();
    this.filteredLogs = this.allLogs.filter(log => {
      if (this.activeLevel !== 'all' && log.level !== this.activeLevel) return false;
      if (this.activeMarket !== 'all' && log.market !== this.activeMarket) return false;
      if (term) {
        const inMessage = log.message.toLowerCase().includes(term);
        const inSymbol = log.symbol?.toLowerCase().includes(term) ?? false;
        if (!inMessage && !inSymbol) return false;
      }
      return true;
    });
  }

  getLevelClass(level: string): string {
    return `level-${level}`;
  }
}
```

- [ ] **Step 4: Create `frontend/src/app/bot-logs/bot-logs-page.component.html`**

```html
<div class="bot-logs-container">
  <h1>Bot Logs</h1>

  <div class="controls">
    <mat-form-field appearance="outline" class="search-field">
      <mat-label>Search</mat-label>
      <input matInput [(ngModel)]="searchTerm" (ngModelChange)="applyFilters()" placeholder="symbol or message">
      <button *ngIf="searchTerm" matSuffix mat-icon-button (click)="searchTerm = ''; applyFilters()">
        <mat-icon>close</mat-icon>
      </button>
      <mat-icon matSuffix *ngIf="!searchTerm">search</mat-icon>
    </mat-form-field>

    <div class="filter-group">
      <span class="filter-label">Level:</span>
      <mat-chip-set>
        <mat-chip [class.active]="activeLevel === 'all'" (click)="setLevel('all')">All</mat-chip>
        <mat-chip [class.active]="activeLevel === 'info'" (click)="setLevel('info')">Info</mat-chip>
        <mat-chip [class.active]="activeLevel === 'warn'" (click)="setLevel('warn')">Warn</mat-chip>
        <mat-chip [class.active]="activeLevel === 'error'" (click)="setLevel('error')">Error</mat-chip>
      </mat-chip-set>
    </div>

    <div class="filter-group">
      <span class="filter-label">Market:</span>
      <mat-chip-set>
        <mat-chip [class.active]="activeMarket === 'all'" (click)="setMarket('all')">All</mat-chip>
        <mat-chip [class.active]="activeMarket === 'MX'" (click)="setMarket('MX')">MX</mat-chip>
        <mat-chip [class.active]="activeMarket === 'USA'" (click)="setMarket('USA')">USA</mat-chip>
      </mat-chip-set>
    </div>
  </div>

  <div *ngIf="loading" class="loading-container">
    <mat-progress-spinner mode="indeterminate" diameter="40"></mat-progress-spinner>
  </div>

  <div *ngIf="!loading && filteredLogs.length === 0" class="empty-state">
    <mat-icon>terminal</mat-icon>
    <p>No bot activity yet — start the bot to see logs here.</p>
  </div>

  <div *ngFor="let log of filteredLogs" class="log-row">
    <span class="timestamp">{{ log.createdAt | date:'MMM d, h:mm:ss a' }}</span>
    <span [class]="getLevelClass(log.level)" class="level-badge">{{ log.level }}</span>
    <span class="event-chip">{{ log.event }}</span>
    <span *ngIf="log.symbol" class="symbol">{{ log.symbol }}</span>
    <span class="message">{{ log.message }}</span>
  </div>
</div>
```

- [ ] **Step 5: Create `frontend/src/app/bot-logs/bot-logs-page.component.scss`**

```scss
.bot-logs-container {
  padding: 16px;
}

h1 {
  margin-bottom: 20px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.search-field {
  width: 260px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
}

mat-chip {
  cursor: pointer;
  opacity: 0.45;
  font-size: 12px !important;
  transition: opacity 0.15s;

  &.active {
    opacity: 1;
  }
}

.loading-container {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 20px;
  color: #666;

  mat-icon {
    font-size: 48px;
    width: 48px;
    height: 48px;
  }

  p {
    margin: 0;
    font-size: 14px;
  }
}

.log-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid #1e1e1e;
  font-size: 13px;
  flex-wrap: wrap;

  &:hover {
    background: #1a1a1a;
  }
}

.timestamp {
  font-size: 11px;
  color: #555;
  white-space: nowrap;
  min-width: 150px;
}

.level-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  &.level-info {
    background: #1a2a3a;
    color: #64b5f6;
  }

  &.level-warn {
    background: #3a2a0a;
    color: #F59E0B;
  }

  &.level-error {
    background: #3a1a1a;
    color: #EF4444;
  }
}

.event-chip {
  font-size: 11px;
  background: #2a2a2a;
  color: #aaa;
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
}

.symbol {
  font-weight: 700;
  color: #fff;
  min-width: 80px;
}

.message {
  color: #ccc;
  flex: 1;
}
```

- [ ] **Step 6: Add route to `frontend/src/app/app.routes.ts`**

Current file:
```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'trade-log',
    loadComponent: () =>
      import('./trade-log/trade-log.component').then(m => m.TradeLogComponent),
  },
  {
    path: 'bot-config',
    loadComponent: () =>
      import('./bot-config/bot-config.component').then(m => m.BotConfigComponent),
  },
];
```

Replace with:
```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'trade-log',
    loadComponent: () =>
      import('./trade-log/trade-log.component').then(m => m.TradeLogComponent),
  },
  {
    path: 'bot-config',
    loadComponent: () =>
      import('./bot-config/bot-config.component').then(m => m.BotConfigComponent),
  },
  {
    path: 'bot-logs',
    loadComponent: () =>
      import('./bot-logs/bot-logs-page.component').then(m => m.BotLogsPageComponent),
  },
];
```

- [ ] **Step 7: Add sidenav entry to `frontend/src/app/app.component.html`**

Current file:
```html
<mat-sidenav-container style="height: 100vh;">
  <mat-sidenav mode="side" opened style="width: 220px; padding: 16px;">
    <mat-nav-list>
      <a mat-list-item routerLink="/dashboard" routerLinkActive="active">
        <mat-icon matListItemIcon>dashboard</mat-icon>
        <span matListItemTitle>Dashboard</span>
      </a>
      <a mat-list-item routerLink="/trade-log" routerLinkActive="active">
        <mat-icon matListItemIcon>receipt_long</mat-icon>
        <span matListItemTitle>Trade Log</span>
      </a>
      <a mat-list-item routerLink="/bot-config" routerLinkActive="active">
        <mat-icon matListItemIcon>settings</mat-icon>
        <span matListItemTitle>Bot Config</span>
      </a>
    </mat-nav-list>
  </mat-sidenav>
  <mat-sidenav-content>
    <mat-toolbar color="primary">
      <span>{{ title }}</span>
    </mat-toolbar>
    <div style="padding: 24px;">
      <router-outlet />
    </div>
  </mat-sidenav-content>
</mat-sidenav-container>
```

Replace with:
```html
<mat-sidenav-container style="height: 100vh;">
  <mat-sidenav mode="side" opened style="width: 220px; padding: 16px;">
    <mat-nav-list>
      <a mat-list-item routerLink="/dashboard" routerLinkActive="active">
        <mat-icon matListItemIcon>dashboard</mat-icon>
        <span matListItemTitle>Dashboard</span>
      </a>
      <a mat-list-item routerLink="/trade-log" routerLinkActive="active">
        <mat-icon matListItemIcon>receipt_long</mat-icon>
        <span matListItemTitle>Trade Log</span>
      </a>
      <a mat-list-item routerLink="/bot-config" routerLinkActive="active">
        <mat-icon matListItemIcon>settings</mat-icon>
        <span matListItemTitle>Bot Config</span>
      </a>
      <a mat-list-item routerLink="/bot-logs" routerLinkActive="active">
        <mat-icon matListItemIcon>terminal</mat-icon>
        <span matListItemTitle>Bot Logs</span>
      </a>
    </mat-nav-list>
  </mat-sidenav>
  <mat-sidenav-content>
    <mat-toolbar color="primary">
      <span>{{ title }}</span>
    </mat-toolbar>
    <div style="padding: 24px;">
      <router-outlet />
    </div>
  </mat-sidenav-content>
</mat-sidenav-container>
```

- [ ] **Step 8: Verify in browser**

With the frontend dev server running (`npx ng serve` in `frontend/`), navigate to `http://localhost:4200/bot-logs`.

Verify:
- Page loads with "Bot Logs" heading
- Search input, Level chips (All/Info/Warn/Error), Market chips (All/MX/USA) are visible
- Empty state "No bot activity yet..." shown if no logs exist
- If logs exist from Task 2 verification, they appear as rows
- Clicking a level chip filters the list
- Typing in search filters by symbol or message

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/core/models/bot-log.model.ts \
        frontend/src/app/core/services/bot-log.service.ts \
        frontend/src/app/bot-logs/ \
        frontend/src/app/app.routes.ts \
        frontend/src/app/app.component.html
git commit -m "feat: add Bot Logs page with live polling and search/filter"
```

---

### Task 4: Agent Logs page + dashboard cleanup

**Files:**
- Create: `frontend/src/app/agent-logs/agent-logs-page.component.ts`
- Create: `frontend/src/app/agent-logs/agent-logs-page.component.html`
- Create: `frontend/src/app/agent-logs/agent-logs-page.component.scss`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.component.html`
- Modify: `frontend/src/app/dashboard/dashboard.component.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.html`

**Interfaces:**
- Consumes: `AgentLogComponent` (existing, no changes) at `../agent-log/agent-log.component`
- Consumes: `BotService.getStatus()` from `../core/services/bot.service`
- Produces: `/agent-logs` route

- [ ] **Step 1: Create `frontend/src/app/agent-logs/agent-logs-page.component.ts`**

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { Subscription, interval } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { BotService } from '../core/services/bot.service';
import { AgentLogComponent } from '../agent-log/agent-log.component';

@Component({
  selector: 'app-agent-logs-page',
  standalone: true,
  imports: [CommonModule, MatChipsModule, AgentLogComponent],
  templateUrl: './agent-logs-page.component.html',
  styleUrls: ['./agent-logs-page.component.scss'],
})
export class AgentLogsPageComponent implements OnInit, OnDestroy {
  activeMarket: 'MX' | 'USA' = 'MX';
  isRunning = false;

  private sub = new Subscription();

  constructor(private botService: BotService) {}

  ngOnInit(): void {
    this.sub.add(
      interval(60_000).pipe(startWith(0)).subscribe(() => this.loadStatus())
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  setMarket(market: 'MX' | 'USA'): void {
    this.activeMarket = market;
    this.loadStatus();
  }

  private loadStatus(): void {
    this.sub.add(
      this.botService.getStatus().subscribe({
        next: ({ configs }) => {
          this.isRunning = configs.find(c => c.market === this.activeMarket)?.isActive ?? false;
        },
      })
    );
  }
}
```

- [ ] **Step 2: Create `frontend/src/app/agent-logs/agent-logs-page.component.html`**

```html
<div class="agent-logs-page">
  <div class="page-header">
    <h1>Agent Logs</h1>
    <mat-chip-set>
      <mat-chip [class.active]="activeMarket === 'MX'" (click)="setMarket('MX')">MX — BMV</mat-chip>
      <mat-chip [class.active]="activeMarket === 'USA'" (click)="setMarket('USA')">USA — NYSE/Nasdaq</mat-chip>
    </mat-chip-set>
  </div>
  <app-agent-log [market]="activeMarket" [isRunning]="isRunning"></app-agent-log>
</div>
```

- [ ] **Step 3: Create `frontend/src/app/agent-logs/agent-logs-page.component.scss`**

```scss
.agent-logs-page {
  padding: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

h1 {
  margin: 0;
}

mat-chip {
  cursor: pointer;
  opacity: 0.45;
  font-size: 12px !important;
  transition: opacity 0.15s;

  &.active {
    opacity: 1;
  }
}
```

- [ ] **Step 4: Add agent-logs route to `frontend/src/app/app.routes.ts`**

The file currently has 5 routes (after Task 3 added bot-logs). Add the agent-logs route:

```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'trade-log',
    loadComponent: () =>
      import('./trade-log/trade-log.component').then(m => m.TradeLogComponent),
  },
  {
    path: 'bot-config',
    loadComponent: () =>
      import('./bot-config/bot-config.component').then(m => m.BotConfigComponent),
  },
  {
    path: 'bot-logs',
    loadComponent: () =>
      import('./bot-logs/bot-logs-page.component').then(m => m.BotLogsPageComponent),
  },
  {
    path: 'agent-logs',
    loadComponent: () =>
      import('./agent-logs/agent-logs-page.component').then(m => m.AgentLogsPageComponent),
  },
];
```

- [ ] **Step 5: Add Agent Logs sidenav entry to `frontend/src/app/app.component.html`**

Add after the Bot Logs entry (inside `<mat-nav-list>`):

```html
      <a mat-list-item routerLink="/agent-logs" routerLinkActive="active">
        <mat-icon matListItemIcon>smart_toy</mat-icon>
        <span matListItemTitle>Agent Logs</span>
      </a>
```

The full sidenav list after this step:
```html
    <mat-nav-list>
      <a mat-list-item routerLink="/dashboard" routerLinkActive="active">
        <mat-icon matListItemIcon>dashboard</mat-icon>
        <span matListItemTitle>Dashboard</span>
      </a>
      <a mat-list-item routerLink="/trade-log" routerLinkActive="active">
        <mat-icon matListItemIcon>receipt_long</mat-icon>
        <span matListItemTitle>Trade Log</span>
      </a>
      <a mat-list-item routerLink="/bot-config" routerLinkActive="active">
        <mat-icon matListItemIcon>settings</mat-icon>
        <span matListItemTitle>Bot Config</span>
      </a>
      <a mat-list-item routerLink="/bot-logs" routerLinkActive="active">
        <mat-icon matListItemIcon>terminal</mat-icon>
        <span matListItemTitle>Bot Logs</span>
      </a>
      <a mat-list-item routerLink="/agent-logs" routerLinkActive="active">
        <mat-icon matListItemIcon>smart_toy</mat-icon>
        <span matListItemTitle>Agent Logs</span>
      </a>
    </mat-nav-list>
```

- [ ] **Step 6: Remove AgentLogComponent from dashboard**

Replace `frontend/src/app/dashboard/dashboard.component.ts` with:

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatBadgeModule } from '@angular/material/badge';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule } from '@angular/forms';
import { PortfolioService } from '../core/services/portfolio.service';
import { BotService } from '../core/services/bot.service';
import { Portfolio } from '../core/models/portfolio.model';
import { BotConfig } from '../core/models/bot-config.model';

type Market = 'MX' | 'USA';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTabsModule, MatCardModule, MatTableModule,
    MatSlideToggleModule, MatBadgeModule, MatIconModule,
    MatProgressSpinnerModule, MatChipsModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  activeMarket: Market = 'MX';
  portfolio: Portfolio | null = null;
  botConfigs: BotConfig[] = [];
  marketOpen: { MX: boolean; USA: boolean } = { MX: false, USA: false };
  loading = true;
  error: string | null = null;
  positionColumns = ['ticker', 'position', 'avgCost', 'mktValue', 'unrealizedPnl'];

  private subs = new Subscription();

  constructor(
    private portfolioService: PortfolioService,
    private botService: BotService,
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.portfolioService.pollPortfolio(30_000).subscribe({
        next: portfolio => {
          this.portfolio = portfolio;
          this.loading = false;
        },
        error: err => {
          this.error = err.message;
          this.loading = false;
        },
      })
    );
    this.subs.add(
      interval(60_000).pipe(startWith(0)).subscribe(() => this.loadBotStatus())
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  loadBotStatus(): void {
    this.subs.add(
      this.botService.getStatus().subscribe({
        next: ({ configs, markets }) => {
          this.botConfigs = configs;
          this.marketOpen = markets;
        },
      })
    );
  }

  onTabChange(index: number): void {
    if (index === 0) this.activeMarket = 'MX';
    else if (index === 1) this.activeMarket = 'USA';
  }

  get activeBotConfig(): BotConfig | undefined {
    return this.botConfigs.find(c => c.market === this.activeMarket);
  }

  get isRunning(): boolean {
    return this.activeBotConfig?.isActive ?? false;
  }

  get isActiveMarketOpen(): boolean {
    return this.marketOpen[this.activeMarket];
  }

  toggleBot(running: boolean): void {
    const config = this.activeBotConfig;
    if (running && config) {
      this.subs.add(
        this.botService.startBot({
          market: this.activeMarket,
          symbols: config.symbols,
          capitalLimit: config.capitalLimit,
          intervalMin: config.intervalMin,
        }).subscribe(() => this.loadBotStatus())
      );
    } else {
      this.subs.add(
        this.botService.stopBot(this.activeMarket)
          .subscribe(() => this.loadBotStatus())
      );
    }
  }

  get currency(): string {
    return this.activeMarket === 'MX' ? 'MXN' : 'USD';
  }
}
```

- [ ] **Step 7: Remove Agent Logs tab from dashboard template**

Replace `frontend/src/app/dashboard/dashboard.component.html` with:

```html
<div class="dashboard-header">
  <h1>Dashboard</h1>
  <div class="bot-control">
    <mat-chip-set>
      <mat-chip [class.active]="isRunning">
        <mat-icon>{{ isRunning ? 'smart_toy' : 'stop' }}</mat-icon>
        {{ isRunning ? 'Bot Running' : 'Bot Stopped' }}
      </mat-chip>
      <mat-chip [class.market-open]="isActiveMarketOpen" [class.market-closed]="!isActiveMarketOpen">
        <mat-icon>{{ isActiveMarketOpen ? 'trending_up' : 'schedule' }}</mat-icon>
        {{ isActiveMarketOpen ? 'Market Open' : 'Market Closed' }}
      </mat-chip>
    </mat-chip-set>
    <mat-slide-toggle
      [checked]="isRunning"
      (change)="toggleBot($event.checked)"
      color="primary">
      {{ isRunning ? 'Stop' : 'Start' }} Bot
    </mat-slide-toggle>
  </div>
</div>

<mat-tab-group (selectedIndexChange)="onTabChange($event)">
  <mat-tab label="MX — BMV">
    <ng-container *ngTemplateOutlet="marketContent"></ng-container>
  </mat-tab>
  <mat-tab label="USA — NYSE/Nasdaq">
    <div class="phase2-notice">
      <mat-icon>info</mat-icon>
      Phase 2 — USA market coming soon. Set ACTIVE_MARKET=USA when ready.
    </div>
  </mat-tab>
</mat-tab-group>

<ng-template #marketContent>
  <div *ngIf="loading" class="loading-container">
    <mat-progress-spinner mode="indeterminate" diameter="48"></mat-progress-spinner>
  </div>

  <div *ngIf="error" class="error-card">
    <mat-icon>error</mat-icon>
    {{ error }} — Is the IBKR Gateway running at localhost:5001?
  </div>

  <div *ngIf="!loading && !error && portfolio" class="cards-row">
    <mat-card>
      <mat-card-header>
        <mat-card-title>Available Funds</mat-card-title>
        <mat-card-subtitle>{{ currency }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <p class="amount">{{ portfolio.summary.availableFunds | number:'1.2-2' }}</p>
      </mat-card-content>
    </mat-card>

    <mat-card>
      <mat-card-header>
        <mat-card-title>Buying Power</mat-card-title>
        <mat-card-subtitle>{{ currency }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <p class="amount">{{ portfolio.summary.buyingPower | number:'1.2-2' }}</p>
      </mat-card-content>
    </mat-card>

    <mat-card>
      <mat-card-header>
        <mat-card-title>Net Liquidation</mat-card-title>
        <mat-card-subtitle>{{ currency }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <p class="amount">{{ portfolio.summary.netLiquidation | number:'1.2-2' }}</p>
      </mat-card-content>
    </mat-card>
  </div>

  <h2 *ngIf="portfolio">Open Positions</h2>
  <table mat-table [dataSource]="portfolio.positions" *ngIf="portfolio">
    <ng-container matColumnDef="ticker">
      <th mat-header-cell *matHeaderCellDef>Symbol</th>
      <td mat-cell *matCellDef="let row">{{ row.ticker }}</td>
    </ng-container>
    <ng-container matColumnDef="position">
      <th mat-header-cell *matHeaderCellDef>Shares</th>
      <td mat-cell *matCellDef="let row">{{ row.position }}</td>
    </ng-container>
    <ng-container matColumnDef="avgCost">
      <th mat-header-cell *matHeaderCellDef>Avg Cost</th>
      <td mat-cell *matCellDef="let row">{{ row.avgCost | number:'1.2-2' }}</td>
    </ng-container>
    <ng-container matColumnDef="mktValue">
      <th mat-header-cell *matHeaderCellDef>Market Value</th>
      <td mat-cell *matCellDef="let row">{{ row.mktValue | number:'1.2-2' }}</td>
    </ng-container>
    <ng-container matColumnDef="unrealizedPnl">
      <th mat-header-cell *matHeaderCellDef>Unrealized P&L</th>
      <td mat-cell *matCellDef="let row"
          [class.positive]="row.unrealizedPnl > 0"
          [class.negative]="row.unrealizedPnl < 0">
        {{ row.unrealizedPnl | number:'1.2-2' }}
      </td>
    </ng-container>
    <tr mat-header-row *matHeaderRowDef="positionColumns"></tr>
    <tr mat-row *matRowDef="let row; columns: positionColumns;"></tr>
  </table>
</ng-template>
```

- [ ] **Step 8: Verify in browser**

1. Navigate to `http://localhost:4200/agent-logs` — Agent Logs page loads with MX/USA chips and the existing chat-bubble log view
2. Clicking "USA — NYSE/Nasdaq" chip switches the market displayed
3. Navigate to `http://localhost:4200/dashboard` — only MX and USA tabs visible, no Agent Logs tab
4. Both "Agent Logs" and "Bot Logs" appear in the sidenav and are highlighted when active

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/agent-logs/ \
        frontend/src/app/app.routes.ts \
        frontend/src/app/app.component.html \
        frontend/src/app/dashboard/dashboard.component.ts \
        frontend/src/app/dashboard/dashboard.component.html
git commit -m "feat: add Agent Logs page, remove from dashboard tab, wire sidenav"
```
