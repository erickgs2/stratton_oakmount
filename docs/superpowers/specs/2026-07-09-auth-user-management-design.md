# Auth + User Management (RBAC) Design

## Context

This is the first of three sub-projects requested together: (1) authentication + user management + role-based permissions — this spec; (2) a new manual-trade feature for MX/USA/crypto, gated by a permission this spec introduces; (3) dashboard open-position filtering by active market tab. (2) and (3) are deliberately out of scope here and get their own specs — (2) depends on the permission model this spec defines, (3) is unrelated to auth entirely.

Today, the application has **no authentication at all** — every API route and every frontend page is open to anyone who can reach them. This spec adds a login-gated app with two independent, togglable permissions layered on top of a "logged in" baseline.

## Permission model

Every authenticated user can **view** everything — dashboard, trade log, bot logs, agent logs, PnL history, and the current Bot Config values (read-only). On top of that baseline, two independent booleans:

- **`canEditConfig`** — write access to Bot Config (save/start/stop), IBKR settings, triggering an immediate agent cycle, and user management itself (creating/editing/deleting other users, including permission changes).
- **`canManualTrade`** — reserved by this spec, not wired to anything yet. Sub-Project 2 will use it to gate the new manual buy/sell feature.

A user can hold any combination: view-only, view+config, view+trade, or all three (effectively admin). There is no separate `Role` table or admin flag — two booleans on the `User` row is sufficient for two togglable permissions, and folding user-management access into `canEditConfig` avoids introducing a third permission concept beyond the two requested.

## Data model

```prisma
model User {
  id              String   @id @default(cuid())
  email           String   @unique
  passwordHash    String
  canEditConfig   Boolean  @default(false)
  canManualTrade  Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

Passwords are hashed with **bcrypt** (new dependency). Emails are stored and compared **lowercased** (normalized on write and on login lookup), so `Foo@Bar.com` and `foo@bar.com` are the same account.

`Trade` gets one additive field so future manual trades (Sub-Project 2) are distinguishable from agent-originated ones in the Trade Log / PnL history, added now so the migration lands with the rest of this spec's schema work:

```prisma
model Trade {
  // ...existing fields unchanged...
  source String @default("agent") // "agent" | "manual"
}
```

## Auth flow

- `POST /api/auth/login` — `{ email, password }` → bcrypt-verify → issues a JWT (`sub`, `email`, `canEditConfig`, `canManualTrade`; **7-day expiry**, stateless — no server-side revocation list) → `{ token, user }`.
- `GET /api/auth/me` — returns the current user from a valid JWT, used on frontend app-init to restore session state without re-sending credentials.
- No logout endpoint — logout is the frontend deleting its stored token.
- No email-based password reset (no email-sending integration exists in this app). Instead, any `canEditConfig` user can set another user's password directly via `POST /api/users/:id/reset-password`.
- Password minimum length: **8 characters**, enforced both frontend (form validation) and backend (defense in depth) on create and reset. No further complexity rules.

**JWT library: `jose`**, not `jsonwebtoken`. The backend is on **Next.js 14.2**, where `middleware.ts` runs on the Edge runtime by default; `jsonwebtoken` depends on Node's `crypto` module and will not work there. `jose` works in both Edge and Node runtimes, so it's used for both signing (in the login route handler) and verification (in middleware), keeping a single JWT dependency.

## Endpoint protection

A root `backend/middleware.ts` intercepts every `/api/*` request except `/api/auth/login`, verifies the JWT (`jose`), and returns `401` before the request reaches any route handler if the token is missing, malformed, or expired. On success, it rebuilds the outgoing request's headers — overwriting, not trusting, any client-supplied header of the same name — injecting `x-user-id` / `x-user-email` / `x-can-edit-config` / `x-can-manual-trade`. Route handlers read these via a new `lib/auth.ts` helper, `getAuthContext(request)`.

This makes "must be logged in" the default for all 19 existing routes plus every future one, without needing to touch each route file individually. Routes needing the elevated `canEditConfig` check on top of the baseline call a second helper, `requirePermission(request, 'canEditConfig')`, which returns `403` if not satisfied:

- `POST /api/bot/config`, `POST /api/bot/start`, `POST /api/bot/stop`
- `POST /api/settings`, `POST /api/ibkr-logout`
- `POST /api/agent/run` (triggers a real agent cycle immediately, closer to a bot-operation trigger than a user-specified trade — grouped here rather than under `canManualTrade`)
- The new `/api/users*` endpoints below

Everything else (all GETs: dashboard data, trade/agent/bot logs, PnL, market data, portfolio, pending orders, IBKR auth status, and `GET /api/bot/status` for reading config) needs only the baseline check.

## User management

All endpoints below require `canEditConfig`:

- `GET /api/users` — list (email, permissions, createdAt — never `passwordHash`)
- `POST /api/users` — create `{ email, password, canEditConfig, canManualTrade }`
- `PATCH /api/users/:id` — update `{ email?, canEditConfig?, canManualTrade? }`
- `POST /api/users/:id/reset-password` — `{ password }`, separate from PATCH so password changes are an explicit, distinct action
- `DELETE /api/users/:id`

**Guardrail:** `PATCH` and `DELETE` both refuse any change that would leave **zero remaining `canEditConfig` users** — including a user revoking their own — since that permanently locks the app out of user management with no way back short of a direct DB edit.

Frontend: new `/users` page — a table of users with inline edit-permissions / reset-password / delete actions, and a "Create User" dialog (email, password, two permission checkboxes). Route-guarded (see below) so only `canEditConfig` users can reach it.

## First admin bootstrap

A one-time seed script (`npx prisma db seed`, via a new `prisma/seed.ts`) reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the environment and creates that user with both permissions set to `true` if a user with that email doesn't already exist. Re-running it is a safe no-op. Run once after deploying this feature. Matches this project's existing convention of driving configuration from `.env` / docker-compose environment variables.

## Frontend integration

- **Token storage:** JWT in `localStorage`, attached as `Authorization: Bearer <token>` by a functional HTTP interceptor on every API request. Chosen over an httpOnly cookie because the frontend and backend already run on different origins (CORS is already configured for this) — a cross-origin cookie needs `SameSite=None; Secure` and gets fragile on the self-hosted Pi/duckdns deployment, whereas a bearer token has no such constraint. On a `401` response, the interceptor triggers logout + redirect to `/login`, so token expiry is handled once, centrally, rather than per-component.
- **`AuthService`** (new) — holds current auth state as a `BehaviorSubject`, matching the existing `IbkrAuthService` pattern. Restores a stored token on app init via `GET /api/auth/me`; clears it and redirects to `/login` if that fails. Exposes `login()`, `logout()`, and permission observables.
- **`/login`** — public route (no guard), email + password form, inline error on failure, redirects to `returnUrl` (or `/dashboard`) on success.
- **Route guard** — one functional `authGuard` (`CanActivateFn`) applied to every route except `/login`. Reads an optional required permission off `route.data` (e.g. `{ requiresPermission: 'canEditConfig' }` on `/bot-config` and `/users`) and redirects if unmet — a single enforcement point rather than per-page checks.
- **Nav bar** — shows the logged-in user's email and a Logout button. Links to Bot Config and Users are hidden for users without `canEditConfig`. This hiding, like the route guard, is UX only — the actual security boundary is the backend's middleware + `requirePermission` checks from the previous section; a user could still reach the API directly.
- **Bot Config page** — view-only users see current values with all fields disabled and the Save/Start/Stop buttons hidden (reading config only needs the baseline check; only the writes require `canEditConfig`).

## Error handling

- `401` — missing, malformed, or expired JWT (middleware, before the route handler runs)
- `403` — valid JWT but missing the required elevated permission (`requirePermission`)
- `400` — validation errors: duplicate email on create, password under 8 characters, missing required fields
- `404` — `PATCH` / `DELETE` / reset-password against a nonexistent user id
- `400` — attempting to remove the last remaining `canEditConfig` user

## Testing

- `lib/auth.ts`: JWT sign/verify round-trip, `getAuthContext` header parsing, `requirePermission` pass/fail
- `middleware.ts`: valid token passes through with correct injected headers; missing/malformed/expired token gets `401`; `/api/auth/login` itself is never blocked; client-supplied `x-can-edit-config`-style headers on the incoming request are overwritten, not trusted
- User CRUD routes: creation with duplicate email rejected, password hashing round-trip, the "last `canEditConfig` user" guardrail on both PATCH and DELETE
- Frontend: `authGuard` redirect behavior (authenticated/unauthenticated/insufficient-permission), interceptor attaches the header and handles `401` by logging out
