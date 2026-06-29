# Bot Logs Page + Agent Logs Page Design

## Goal

Add a Bot Logs page (unified live feed of operational events and Claude decisions with search/filter) and promote Agent Logs from a dashboard tab to a dedicated sidenav page.

## Architecture

Two new Angular routes and sidenav entries. One new Prisma model (`BotLog`) to persist operational events. Five instrumentation points in existing backend code write to `BotLog`. The Bot Logs page polls `/api/bot/logs` every 10 s and filters client-side. The Agent Logs page is the existing `AgentLogComponent` promoted to a full page with self-managed market and running-state.

## Tech Stack

Angular 17 standalone components, Angular Material, RxJS polling (interval + startWith + switchMap), Prisma ORM, Next.js 14 App Router.

---

## Data Model

### New: `BotLog` (Prisma model)

```prisma
model BotLog {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  level     String   // 'info' | 'warn' | 'error'
  event     String   // 'bot_started' | 'bot_stopped' | 'cycle_error' | 'cycle_complete' | 'order_placed'
  market    String?
  symbol    String?
  message   String
  meta      Json?
}
```

`AgentLog` is unchanged. `BotLog` holds lightweight operational events; `AgentLog` holds full structured AI decision records.

---

## Backend Changes

### New file: `backend/app/api/bot/logs/route.ts`

`GET /api/bot/logs`

Query params:
- `market`: `'MX' | 'USA'` — optional, validated (400 on unknown value)
- `level`: `'info' | 'warn' | 'error'` — optional, validated (400 on unknown value)
- `limit`: integer 1–500, default 200

Response: `{ logs: BotLog[] }` ordered `createdAt desc`.

No server-side text search — the frontend filters the fetched batch client-side.

### Modified: `backend/lib/bot-logger.ts` (new helper)

A thin wrapper over `prisma.botLog.create` so instrumentation points stay one-liners:

```typescript
export async function writeBotLog(entry: {
  level: 'info' | 'warn' | 'error';
  event: 'bot_started' | 'bot_stopped' | 'cycle_error' | 'cycle_complete' | 'order_placed';
  market?: string;
  symbol?: string;
  message: string;
  meta?: Record<string, unknown>;
}): Promise<void>
```

Errors from `writeBotLog` are caught internally and logged to `console.error` — a logging failure must never crash a bot cycle.

### Instrumentation points

| File | Location | Event | Level | Message format |
|---|---|---|---|---|
| `bot/start/route.ts` | After upsert | `bot_started` | info | `"Bot started for ${market} — ${symbols.slice(0,2).join(', ')}${symbols.length > 2 ? ` (+${symbols.length - 2} more)` : ''}"` |
| `bot/stop/route.ts` | After upsert | `bot_stopped` | info | `"Bot stopped for ${market}"` |
| `bot/start/route.ts` | In setInterval catch | `cycle_error` | error | `(err as Error).message` |
| `claude-agent.ts` | After `prisma.agentLog.create` | `cycle_complete` | info | `"${symbol} → ${decision.action.toUpperCase()} x${decision.quantity} (confidence ${decision.confidence.toFixed(2)})"` — meta: `{ action, quantity, confidence }` |
| `claude-agent.ts` | After `ibkrClient.placeOrder` | `order_placed` | info | `"${symbol} ${decision.action.toUpperCase()} x${decision.quantity} @ ${lastPrice.toFixed(2)} ${currency} — order #${ibkrOrderId}"` |

`cycle_complete` fires on every completed agent cycle (hold, buy, or sell). `order_placed` only fires when IBKR actually executes (`confidence >= 0.65 && quantity > 0 && conid exists`).

---

## Frontend Changes

### Sidenav (`app.component.html`)

Add two nav items after "Bot Config":

```
smart_toy  →  Agent Logs  →  /agent-logs
terminal   →  Bot Logs    →  /bot-logs
```

### Routes (`app.routes.ts`)

Add:
```typescript
{ path: 'agent-logs', loadComponent: () => import('./agent-logs/agent-logs-page.component') }
{ path: 'bot-logs',   loadComponent: () => import('./bot-logs/bot-logs-page.component') }
```

### New file: `frontend/src/app/agent-logs/agent-logs-page.component.ts`

A thin wrapper page that renders `AgentLogComponent`. Manages its own `market` state (default `'MX'`) via MX/USA chip toggle rendered at the top of the page. Calls `BotService.getStatus()` on init to determine `isRunning` for the active market. Subscribes to a 60 s interval to keep `isRunning` current. Passes `[market]` and `[isRunning]` to `<app-agent-log>`.

**No changes to `AgentLogComponent` itself** — it already accepts `[market]` and `[isRunning]` inputs and manages its own polling.

### Dashboard changes

- Remove the "Agent Logs" `<mat-tab>` (index 2) from `dashboard.component.html`
- Remove `AgentLogComponent` import from `dashboard.component.ts`
- Remove the `index 2` branch from `onTabChange()` — only indices 0 (MX) and 1 (USA) remain

### New file: `frontend/src/app/core/models/bot-log.model.ts`

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

### New file: `frontend/src/app/core/services/bot-log.service.ts`

```typescript
getLogs(params: { market?: 'MX' | 'USA'; level?: 'info' | 'warn' | 'error'; limit?: number }): Observable<{ logs: BotLog[] }>
```

### New file: `frontend/src/app/bot-logs/bot-logs-page.component.ts`

**Polling**: `interval(10_000).pipe(startWith(0), switchMap(() => botLogService.getLogs({ limit: 200 })))` — always fetches without server-side filter params; subscription tracked in `Subscription`, unsubscribed on destroy.

**State**:
- `allLogs: BotLog[]` — raw fetch result
- `searchTerm = ''` — bound to search input
- `activeLevel: 'all' | 'info' | 'warn' | 'error' = 'all'`
- `activeMarket: 'all' | 'MX' | 'USA' = 'all'`

**Filtering**: `filteredLogs: BotLog[]` is a class field (not a getter) recomputed by `applyFilters()`. `applyFilters()` filters `allLogs` by `activeLevel`, `activeMarket`, and `searchTerm` (case-insensitive match on `message` and `symbol`). Called in three places: when new logs arrive from the poll, when a chip is clicked, and when the search input changes. This avoids re-filtering on every change-detection cycle.

**Template**:
- Search `<mat-form-field>` with `<input>` bound to `searchTerm` and `(ngModelChange)="applyFilters()"`
- Level chips: All / Info / Warn / Error — `[class.active]` on selected; click sets `activeLevel` and calls `applyFilters()`
- Market chips: All / MX / USA — `[class.active]` on selected; click sets `activeMarket` and calls `applyFilters()`
- `*ngFor` on `filteredLogs`, each row:
  - `{{ log.createdAt | date:'MMM d, h:mm:ss a' }}`
  - Level badge `<span [class]="'level-' + log.level">{{ log.level }}</span>`
  - Event chip `<span class="event-chip">{{ log.event }}</span>`
  - Symbol `<span *ngIf="log.symbol" class="symbol">{{ log.symbol }}</span>`
  - Message `<span class="message">{{ log.message }}</span>`
- Empty state when `filteredLogs.length === 0`

**Level badge colors** (SCSS):
- `.level-info` → `$primary` blue
- `.level-warn` → amber `#F59E0B`
- `.level-error` → red `#EF4444`
