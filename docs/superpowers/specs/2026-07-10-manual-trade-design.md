# Manual Trade — Design Spec

This is Sub-Project 2 of three requested together on 2026-07-09: (1) authentication + user management + role-based permissions ([spec](2026-07-09-auth-user-management-design.md), complete); (2) manual trading for MX/USA/crypto, gated by the `canManualTrade` permission that sub-project 1 introduced — this spec; (3) dashboard open-position filtering by active market tab, still deferred, unrelated to this work.

## Overview

Adds a `canManualTrade`-gated capability letting an authorized user place an immediate market-order buy or sell against any symbol already offered in that market's Bot Config, independent of the automated agent. MX/USA trades are sized in share quantity; crypto trades (buy and sell) are sized in an MXN amount, converted to a coin quantity at the live price. Every manual trade still respects real available funds/holdings and, for MX/USA, market hours — it simply is not subject to the 20%-per-symbol / `capitalLimit` caps built for the autonomous agent, since the user is making an explicit, one-off decision.

## Permission Model

Reuses the `canManualTrade` boolean already on `User` (added, unused, by Sub-Project 1). No new permission is introduced. `canManualTrade` and `canEditConfig` remain independent — a user can have either, both, or neither on top of the baseline "view" access every authenticated user has.

## Data Model

One additive field on `Trade`, no migration risk to existing rows (nullable):

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

`placedByEmail` is a plain denormalized string, not a relation to `User` — this keeps the Trade Log readable without a join and means historical trades are unaffected if the placing user is later deleted.

## Backend

### `backend/lib/manual-trade.ts` (new)

A self-contained module, deliberately independent of `claude-agent.ts`/`crypto-agent.ts` — it calls `ibkrClient`/`bitsoClient` directly rather than reusing the agents' internal order-placement helper, so this user-facing feature isn't coupled to code shaped around Claude's autonomous decision flow.

```typescript
export interface ManualTradeParams {
  market: Market;
  symbol: string;
  side: 'buy' | 'sell';
  quantity?: number;   // required for MX/USA
  mxnAmount?: number;  // required for CRYPTO
  placedByEmail: string;
}

export interface ManualTradeResult {
  success: boolean;
  trade?: { id: string; quantity: number; price: number };
  error?: string;
}

export async function executeManualTrade(params: ManualTradeParams): Promise<ManualTradeResult>
```

**MX/USA path:**
1. Reject if `market` is closed (reuse `isMarketOpen`).
2. Reject non-positive or non-integer `quantity`.
3. For `sell`, reject if `quantity` exceeds the live IBKR position (`ibkrClient.getPositions()`).
4. Resolve `conid` — check the live position list first, then `ibkrClient.searchConid` as fallback (same approach used internally by the agent).
5. Fetch the current live price for `symbol` (reuse the existing market-data snapshot function for `market`).
6. For `buy`, reject if `quantity * lastPrice` exceeds `ibkrClient.getAccountSummary().availableFunds`.
7. Place the order via `ibkrClient.placeOrder`.
8. On success, insert the `Trade` row (`source: 'manual'`, `placedByEmail`, `price: lastPrice`, `currency: market === 'MX' ? 'MXN' : 'USD'`).

The price used for the `Trade` row and the funds check is always fetched fresh by the backend at submit time — the frontend never sends a price, only `quantity`/`mxnAmount`, so a stale client-side quote can't affect what's actually validated or recorded.

**CRYPTO path:**
1. Reject non-positive `mxnAmount`.
2. Fetch the live price for `symbol`.
3. Convert to coin quantity: `mxnAmount / lastPrice`.
4. For `buy`, reject if `mxnAmount` exceeds the available MXN balance (`bitsoClient.getBalances()`).
5. For `sell`, reject if the converted coin quantity exceeds the held coin balance.
6. Place the order via `bitsoClient.placeOrder`.
7. On success, insert the `Trade` row (`source: 'manual'`, `placedByEmail`, `currency: 'MXN'`).

No market-hours check for crypto — it trades 24/7, same as the automated crypto path.

### `POST /api/trades/manual` (new)

- First line: `requirePermission(getAuthContext(request), 'canManualTrade')`.
- `placedByEmail` comes from the trusted `x-user-email` header set by `middleware.ts` — never read from the request body, so a client can't spoof attribution.
- Body: `{ market, symbol, side, quantity?, mxnAmount? }`.
- Returns `200 { trade }` on success; `400 { error }` for validation failures (market closed, invalid amount, insufficient funds/holdings); `502 { error }` if the broker itself rejects the order.

## Frontend

### Shared symbol list

Extract `MX_SYMBOLS` / `USA_SYMBOLS` / `CRYPTO_SYMBOLS` (currently defined only inside `bot-config.component.ts`) into a new `frontend/src/app/core/models/market-symbols.ts`. Both Bot Config and the new manual-trade dialog import from there — a single source of truth for which symbols/coins are eligible anywhere in the app.

### `ManualTradeService` (new, `core/services/manual-trade.service.ts`)

One method: `execute(request: ManualTradeRequest): Observable<{ trade }>`, POSTs to `/api/trades/manual`.

### `ManualTradeDialogComponent` (new, standalone)

Opened via `MatDialog.open(ManualTradeDialogComponent, { data: { market, positions, cryptoPortfolio } })` from the Dashboard. A dedicated component (not an in-file `<ng-template>`, unlike Bot Config/Users) because this form is richer — market-conditional fields, a live price lookup, and a two-step confirm — and keeping it separate avoids growing `dashboard.component.ts`, which already manages three markets' portfolios/configs/PnL.

- **Step 1 (form):** side toggle (buy/sell), symbol `mat-select` (from the shared symbol list for `data.market`), a quantity input (MX/USA) or MXN-amount input (crypto) — label and validation switch on market — a live price fetched from the existing `/api/market-data/*` endpoint on symbol change, and a funds/position hint sourced from the `positions`/`cryptoPortfolio` snapshot passed in via dialog data.
- **Step 2 (confirm):** summary (symbol, side, quantity/amount, estimated price, estimated total) plus "Confirm & Place Order" / "Back" buttons.

The funds/position hint shown in Step 1 can be up to ~30s stale (Dashboard's normal poll interval). This is harmless: `executeManualTrade` always re-validates against live IBKR/Bitso data server-side at submit time, so a stale hint can never cause an actual over-sell or over-spend — the worst case is a clear rejection asking the user to adjust the amount.

### Dashboard integration

One "Manual Trade" button per market tab (MX/USA/CRYPTO), shown only when `authService.hasPermission('canManualTrade')` is true (same pattern as Bot Config's nav-link gating). Opens the dialog scoped to that tab's market. On `afterClosed()` with a successful result, triggers an immediate portfolio refresh instead of waiting for Dashboard's next poll cycle.

## Error Handling

All backend rejections (market closed, invalid/zero amount, insufficient funds, insufficient holdings, broker-side rejection) come back as `{ error: "<message>" }` and render inline on the dialog's confirm step — same `errorMessage` pattern already used in `users.component.ts` and `login.component.ts`. A generic fallback message covers network/unexpected failures.

## Testing

- Backend: `manual-trade.test.ts` covering every `executeManualTrade` branch (MX/USA buy/sell success and each rejection reason; CRYPTO buy/sell success and each rejection reason), with `ibkrClient`/`bitsoClient`/`prisma` mocked. A route-level test for the `canManualTrade` permission gate and success/error passthrough.
- Frontend: `manual-trade.service.spec.ts` (HTTP mock, mirrors `user.service.spec.ts`); `manual-trade-dialog.component.spec.ts` (field validation, step transition, success/error display); a new `dashboard.component.spec.ts` (none exists yet) covering the Manual Trade button's `canManualTrade` visibility gating, mirroring the pattern in `app.component.spec.ts`'s Bot Config link tests.

## Out of Scope

- Limit orders — market orders only, matching the automated agent's existing order type.
- Free-text symbol search — restricted to the same static per-market list Bot Config offers.
- Dashboard open-position filtering by active market tab — Sub-Project 3, separate spec.
