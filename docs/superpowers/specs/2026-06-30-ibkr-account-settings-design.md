# IBKR Account Settings + Gateway Logout — Design Spec

**Date:** 2026-06-30
**Scope:** Make the IBKR account ID configurable at runtime (replacing the hardcoded `IBKR_ACCOUNT_ID` env var) and add a gateway logout action, so a user can switch between the paper and live IBKR accounts without editing `.env` or restarting the backend.

Related: [[project-mobile-ibkr-auth]] (existing auth-gate overlay this extends), [[project-stratton-oakmont]].

---

## Background

`backend/lib/ibkr.ts` currently reads `IBKR_ACCOUNT_ID` once in the `IBKRClient` constructor and freezes it as a `readonly` field for the process lifetime. The user diagnosed that logging in with the live IBKR account (as opposed to paper) fails to authenticate because the configured account ID doesn't match the account actually being logged into on the gateway — and the only way to change it today is editing `.env` on the Pi and restarting the backend container. This spec makes the account ID a runtime setting, editable from the dashboard, with a companion logout action so the gateway session can be deliberately ended before switching accounts.

---

## 1. Persistence

New Prisma model, a single always-present row:

```prisma
model AppSettings {
  id            String  @id @default("singleton")
  ibkrAccountId String?
}
```

A migration adds this table. No seed data required — `ibkrAccountId` starts `null`, and `IBKRClient` falls back to `process.env.IBKR_ACCOUNT_ID` until the first save (see below), so existing `.env`-based setups keep working unchanged until the user opts into the new UI.

---

## 2. `IBKRClient` runtime account ID

**File:** `backend/lib/ibkr.ts`

Today: `private readonly accountId: string` set once in the constructor from `process.env.IBKR_ACCOUNT_ID`.

New behavior:
- `private cachedAccountId: string | null = null;` — `null` means "not yet resolved," distinct from an empty configured value.
- `private async resolveAccountId(): Promise<string>` — if `cachedAccountId !== null`, return it. Otherwise query `prisma.appSettings.findUnique({ where: { id: 'singleton' } })`; set `cachedAccountId` to `settings?.ibkrAccountId || process.env.IBKR_ACCOUNT_ID || ''`; return it.
- `setAccountId(id: string): void` — sets `cachedAccountId = id` directly (called by the settings API route right after a successful DB write, so the running process picks up the change immediately without waiting for the next `resolveAccountId()` DB round-trip).
- `getPositions()`, `getAccountSummary()`, and `placeOrder()` change from `this.accountId` to `await this.resolveAccountId()`.
- New `async logout(): Promise<void>` — calls `this.request('/logout', { method: 'POST' })`, mirroring the existing `/tickle` call in `startKeepAlive()`.

The constructor no longer sets `accountId` at all (removed); the `console.log('[IBKR] init...')` line drops the `accountId` field since it's not known synchronously anymore.

---

## 3. Backend API

Two new route files, following the existing thin-handler pattern used by `backend/app/api/bot/config/route.ts` (no dedicated route-level tests in this codebase — only `lib/` is unit tested).

**`backend/app/api/settings/route.ts`**
- `GET`: returns `{ ibkrAccountId: string | null }` read directly from `prisma.appSettings.findUnique(...)` (not `resolveAccountId()`, so the UI reflects the true DB state — including `null` — separately from the client's env-fallback behavior).
- `PUT`: body `{ ibkrAccountId: string }`. Upserts the singleton row, then calls `ibkrClient.setAccountId(ibkrAccountId)`. Returns `{ status: 'saved', ibkrAccountId }`.

**`backend/app/api/ibkr-logout/route.ts`**
- `POST`: calls `await ibkrClient.logout()`. On success returns `{ success: true }`. On thrown error, catches and returns `{ success: false }` with HTTP 200 (matching the tolerant-error style already used in `ibkr-auth-status`) — a failed logout call shouldn't crash the request; the auth-status poll will reflect the real gateway state regardless.

---

## 4. Frontend: Bot Config page

**Files:** `frontend/src/app/bot-config/bot-config.component.{ts,html,scss}`, new `frontend/src/app/core/services/settings.service.ts`, new `frontend/src/app/core/models/settings.model.ts`

`SettingsService` (mirrors `BotService`'s shape): `getSettings(): Observable<Settings>`, `updateSettings(ibkrAccountId: string): Observable<Settings>`, `logout(): Observable<{ success: boolean }>`.

A new card is added to `bot-config.component.html`, above the existing MX/USA `mat-tab-group`:

```
┌─ IBKR Account ──────────────────────────┐
│ Account ID: [ U1234567             ]    │
│ [Save]                    [Log Out]     │
└──────────────────────────────────────────┘
```

- Loaded in `ngOnInit()` alongside the existing `botService.getStatus()` call.
- **Save**: same saving/snackbar pattern already used by `saveConfig()` in this component (disable button while in flight, snackbar on success/error).
- **Log Out**: guarded by a native `confirm('Log out of the IBKR gateway? You will need to log in again to reconnect.')` before calling `settingsService.logout()`, since it deliberately ends the live trading session. Snackbar on the result either way.

---

## 5. Frontend: Auth-gate modal

**Files:** `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.{ts,html,scss}`

- Injects `SettingsService`. On construction (or first render while disconnected), fetches the current `ibkrAccountId`.
- Template behavior:
  - If `ibkrAccountId` is set: show `Configured account: <id>` plus a radio choice — **Keep this account** (default, selected) / **Use a different account** (reveals a text input, initially empty, required).
  - If `ibkrAccountId` is `null`: skip the radio choice entirely, show the text input directly with label "IBKR account ID", required.
- The existing "Open IBKR Login" button becomes disabled if the change-mode input is required-but-empty. On click:
  1. If in "change" mode (or no account was ever configured), call `settingsService.updateSettings(newId)` and wait for it to complete.
  2. Then run the existing `openLogin()` logic unchanged (SFSafariViewController on native, `window.open` on web).
- No logout affordance here — per the approved flow, logout only lives on the Bot Config page (reachable while connected); this modal only ever appears while disconnected, so there's no live session here to end.

---

## 6. Backend tests

**File:** `backend/__tests__/ibkr.test.ts`

Add `jest.mock('@/lib/prisma', ...)` alongside the existing `https` mock, exposing a mocked `prisma.appSettings.findUnique`. New `describe` blocks:
- `resolveAccountId` (exercised indirectly via `getPositions`/`getAccountSummary`): returns the DB value when a row exists; falls back to `process.env.IBKR_ACCOUNT_ID` when the row is absent; only queries Prisma once across multiple calls (cache hit on the second call).
- `setAccountId`: after calling it, a subsequent `getPositions()` uses the new value without any further Prisma call.
- `logout()`: issues `POST /logout` against the configured `baseUrl`.

---

## Out of Scope

- Multi-account list / account picker dropdown (IBKR gateway doesn't expose a "list accounts" call we use today) — this is a single free-text account ID field, matching how `IBKR_ACCOUNT_ID` worked before.
- Automatically calling `logout()` when the account ID is changed via Settings or the auth-gate modal — logout is a separate, explicit action per the approved flow.
- Encrypting or masking the account ID at rest or in transit — treated as a low-sensitivity identifier for this single-user personal app, consistent with how it was already visible in `.env` and server logs.
- Any change to `IBKR_GATEWAY_URL` handling — out of scope, unrelated to this bug.
