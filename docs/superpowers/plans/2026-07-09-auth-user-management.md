# Auth + User Management (RBAC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JWT-based authentication and a two-permission RBAC model (`canEditConfig`, `canManualTrade`) protecting every existing API route and frontend page, plus a user management UI for creating/editing/removing accounts.

**Architecture:** A Next.js root `middleware.ts` verifies a JWT on every `/api/*` request except login and injects trusted `x-*` headers for route handlers to read; six existing "write" routes plus new `/api/users*` routes add an explicit `canEditConfig` check on top of that baseline. The Angular frontend gets a login page, a `BehaviorSubject`-backed `AuthService` (mirroring the existing `IbkrAuthService` pattern), an HTTP interceptor attaching the bearer token, and a route guard reading a `requiresPermission` value off route data.

**Tech Stack:** `jose` (JWT — chosen over `jsonwebtoken` because Next.js 14's middleware runs on the Edge runtime, where Node's `crypto` module isn't available), `bcryptjs` (password hashing — chosen over native `bcrypt` because this app deploys to an Alpine Docker image on a Raspberry Pi (ARM), where `bcrypt`'s native compilation has a real, known failure history in this exact class of environment; `bcryptjs` is pure JS, no native bindings, API-compatible).

## Global Constraints

- Permission model: every authenticated user can view everything; `canEditConfig` and `canManualTrade` are independent booleans on `User`, not mutually-exclusive roles.
- User management (create/edit/delete users) requires `canEditConfig` — no separate admin concept.
- JWT: 7-day expiry, stateless (no server-side revocation list), payload carries `sub`, `email`, `canEditConfig`, `canManualTrade`.
- Token storage: `localStorage` on the frontend, sent as `Authorization: Bearer <token>`.
- Password minimum length: 8 characters, enforced both frontend and backend.
- Emails stored and compared lowercased.
- No email-based password reset — a `canEditConfig` user resets another user's password directly.
- The system must never end up with zero `canEditConfig` users — `PATCH`/`DELETE` on `/api/users/:id` block any change that would cause this.
- `canManualTrade` is defined and enforced by this plan but not wired to any feature yet — that's a separate plan.

---

### Task 1: Dependencies, Prisma schema, migration, and environment wiring

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_user_and_trade_source/migration.sql`
- Modify: `backend/.env.local`
- Modify: `docker-compose.yml` (repo root)

**Interfaces:**
- Produces: `User` Prisma model (`id`, `email`, `passwordHash`, `canEditConfig`, `canManualTrade`, `createdAt`, `updatedAt`) and `Trade.source` (`String`, default `"agent"`) — every later task that touches users or trades relies on these exact field names.

- [ ] **Step 1: Install dependencies**

```bash
cd backend
npm install bcryptjs jose
npm install -D @types/bcryptjs
```

- [ ] **Step 2: Add the `User` model and `Trade.source` field to the schema**

Add this model anywhere in `backend/prisma/schema.prisma` (after `AppSettings` is a reasonable spot):

```prisma
model User {
  id             String   @id @default(cuid())
  email          String   @unique
  passwordHash   String
  canEditConfig  Boolean  @default(false)
  canManualTrade Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

Add one field to the existing `Trade` model:

```prisma
model Trade {
  id          String   @id @default(cuid())
  symbol      String
  market      String   // "MX" | "USA"
  action      String   // "buy" | "sell" | "hold"
  quantity    Float
  price       Float
  currency    String   // "MXN" | "USD"
  reason      String
  ibkrOrderId String?
  source      String   @default("agent") // "agent" | "manual"
  createdAt   DateTime @default(now())
}
```

- [ ] **Step 3: Generate the migration**

```bash
npx prisma migrate dev --name add_user_and_trade_source
```

This project's `master` DB user does not own existing tables (`Trade`), so this will very likely fail on the `ALTER TABLE "Trade"` statement with a permissions error (`must be owner of table Trade`) — this is expected, matches this project's established pattern. Note the exact migration folder name Prisma printed (e.g. `20260709120000_add_user_and_trade_source`) and continue.

- [ ] **Step 4: Apply the generated SQL directly, then reconcile Prisma's migration history**

```bash
cat prisma/migrations/*_add_user_and_trade_source/migration.sql
```

Apply that exact SQL via `psql` (the local `egarsev` OS user has full ownership/superuser rights on this database, unlike `master`):

```bash
psql "postgresql://localhost:5432/stratton_oakmont" -v ON_ERROR_STOP=1 -f prisma/migrations/*_add_user_and_trade_source/migration.sql
```

Then tell Prisma it's applied and regenerate the client:

```bash
npx prisma migrate resolve --applied <the_exact_migration_folder_name_from_step_3>
npx prisma generate
npx prisma migrate status
```

Expected: `Database schema is up to date!`

- [ ] **Step 5: Add the new environment variables**

Generate a real secret and add all three variables to `backend/.env.local` (this file is gitignored — safe to edit directly):

```bash
openssl rand -base64 32
```

Append to `backend/.env.local` (replace `<generated>` with the output above, and pick real admin credentials):

```
JWT_SECRET=<generated>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme-please-use-a-real-password
```

- [ ] **Step 6: Wire `JWT_SECRET` into `docker-compose.yml` — do not skip this step**

This project has a documented, hours-long-debugging incident where a new backend env var (`BITSO_API_KEY`) worked locally but silently failed on the Raspberry Pi deployment because it was never added to `docker-compose.yml`'s `backend.environment` allowlist — Docker Compose does not forward arbitrary host/`.env` variables into a container; only variables explicitly listed under `environment:` reach it, regardless of what's in `.env.local` or `.env`. Add `JWT_SECRET` to the existing `backend.environment` list in the repo-root `docker-compose.yml`:

```yaml
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - DATABURSATIL_TOKEN=${DATABURSATIL_TOKEN}
      - IBKR_GATEWAY_URL=${IBKR_GATEWAY_URL}
      - IBKR_ACCOUNT_ID=${IBKR_ACCOUNT_ID}
      - BITSO_API_KEY=${BITSO_API_KEY}
      - BITSO_API_SECRET=${BITSO_API_SECRET}
      - BITSO_API_HOSTNAME=${BITSO_API_HOSTNAME:-api.bitso.com}
      - CORS_ORIGIN=${CORS_ORIGIN:-http://localhost:4200}
      - JWT_SECRET=${JWT_SECRET}
```

(`ADMIN_EMAIL`/`ADMIN_PASSWORD` are only needed at seed time, run manually — see Task 5 — so they don't need to live in the container's always-on environment, but do need to be present in whatever shell/`.env` runs the seed command.)

- [ ] **Step 7: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/prisma/schema.prisma backend/prisma/migrations docker-compose.yml
git commit -m "feat: add User model, Trade.source, and auth dependencies"
```

---

### Task 2: Auth primitives — `lib/auth.ts`

**Files:**
- Create: `backend/lib/auth.ts`
- Test: `backend/__tests__/auth.test.ts`

**Interfaces:**
- Consumes: `process.env.JWT_SECRET`, `prisma.user` (from `@/lib/prisma`, added in Task 1)
- Produces (all exported from `@/lib/auth`, relied on by every later backend task):
  - `interface AuthTokenPayload { sub: string; email: string; canEditConfig: boolean; canManualTrade: boolean; }`
  - `interface AuthContext { userId: string; email: string; canEditConfig: boolean; canManualTrade: boolean; }`
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword(password: string, hash: string): Promise<boolean>`
  - `signToken(payload: AuthTokenPayload): Promise<string>`
  - `verifyToken(token: string): Promise<AuthTokenPayload | null>`
  - `buildAuthHeaders(existingHeaders: Headers, payload: AuthTokenPayload): Headers`
  - `getAuthContext(request: NextRequest): AuthContext | null`
  - `requirePermission(context: AuthContext | null, permission: 'canEditConfig' | 'canManualTrade'): NextResponse | null` (returns a 403 `NextResponse` if denied, `null` if allowed — callers do `const denied = requirePermission(ctx, 'canEditConfig'); if (denied) return denied;`)
  - `hasAnotherConfigEditor(excludingUserId: string): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/auth.test.ts`:

```typescript
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      count: jest.fn(),
    },
  },
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  buildAuthHeaders,
  getAuthContext,
  requirePermission,
  hasAnotherConfigEditor,
  AuthTokenPayload,
} from '@/lib/auth';

const PAYLOAD: AuthTokenPayload = {
  sub: 'user-1',
  email: 'trader@example.com',
  canEditConfig: true,
  canManualTrade: false,
};

describe('hashPassword / verifyPassword', () => {
  it('round-trips a password correctly', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});

describe('signToken / verifyToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-value-at-least-32-bytes-long';
  });

  it('round-trips a payload correctly', async () => {
    const token = await signToken(PAYLOAD);
    const decoded = await verifyToken(token);
    expect(decoded).toEqual(PAYLOAD);
  });

  it('returns null for a malformed token', async () => {
    expect(await verifyToken('not-a-real-token')).toBeNull();
  });

  it('returns null for a token signed with a different secret', async () => {
    const token = await signToken(PAYLOAD);
    process.env.JWT_SECRET = 'a-completely-different-secret-value-32b';
    expect(await verifyToken(token)).toBeNull();
  });

  it('throws if JWT_SECRET is not set', async () => {
    delete process.env.JWT_SECRET;
    await expect(signToken(PAYLOAD)).rejects.toThrow('JWT_SECRET');
  });
});

describe('buildAuthHeaders', () => {
  it('sets the trusted headers from the payload', () => {
    const result = buildAuthHeaders(new Headers(), PAYLOAD);
    expect(result.get('x-user-id')).toBe('user-1');
    expect(result.get('x-user-email')).toBe('trader@example.com');
    expect(result.get('x-can-edit-config')).toBe('true');
    expect(result.get('x-can-manual-trade')).toBe('false');
  });

  it('overwrites a client-supplied header of the same name instead of trusting it', () => {
    const incoming = new Headers({ 'x-can-edit-config': 'true' });
    const result = buildAuthHeaders(incoming, { ...PAYLOAD, canEditConfig: false });
    expect(result.get('x-can-edit-config')).toBe('false');
  });

  it('preserves unrelated existing headers', () => {
    const incoming = new Headers({ 'content-type': 'application/json' });
    const result = buildAuthHeaders(incoming, PAYLOAD);
    expect(result.get('content-type')).toBe('application/json');
  });
});

describe('getAuthContext', () => {
  it('returns null when the trusted headers are absent', () => {
    const request = new NextRequest('http://localhost/api/bot/status');
    expect(getAuthContext(request)).toBeNull();
  });

  it('parses a fully-populated set of trusted headers', () => {
    const request = new NextRequest('http://localhost/api/bot/status', {
      headers: {
        'x-user-id': 'user-1',
        'x-user-email': 'trader@example.com',
        'x-can-edit-config': 'true',
        'x-can-manual-trade': 'false',
      },
    });
    expect(getAuthContext(request)).toEqual({
      userId: 'user-1',
      email: 'trader@example.com',
      canEditConfig: true,
      canManualTrade: false,
    });
  });
});

describe('requirePermission', () => {
  const allowed = { userId: 'u1', email: 'a@b.com', canEditConfig: true, canManualTrade: false };
  const denied = { userId: 'u2', email: 'c@d.com', canEditConfig: false, canManualTrade: false };

  it('returns null when the context has the required permission', () => {
    expect(requirePermission(allowed, 'canEditConfig')).toBeNull();
  });

  it('returns a 403 response when the context lacks the required permission', async () => {
    const response = requirePermission(denied, 'canEditConfig');
    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);
  });

  it('returns a 403 response when there is no context at all', () => {
    const response = requirePermission(null, 'canEditConfig');
    expect(response!.status).toBe(403);
  });
});

describe('hasAnotherConfigEditor', () => {
  it('returns true when another canEditConfig user exists', async () => {
    (prisma.user.count as jest.Mock).mockResolvedValue(1);
    expect(await hasAnotherConfigEditor('user-1')).toBe(true);
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { canEditConfig: true, id: { not: 'user-1' } },
    });
  });

  it('returns false when no other canEditConfig user exists', async () => {
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    expect(await hasAnotherConfigEditor('user-1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && npx jest auth.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/auth'`

- [ ] **Step 3: Implement `backend/lib/auth.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

const SALT_ROUNDS = 10;

export interface AuthTokenPayload {
  sub: string;
  email: string;
  canEditConfig: boolean;
  canManualTrade: boolean;
}

export interface AuthContext {
  userId: string;
  email: string;
  canEditConfig: boolean;
  canManualTrade: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: AuthTokenPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    canEditConfig: payload.canEditConfig,
    canManualTrade: payload.canManualTrade,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    return {
      sub: payload.sub,
      email: payload.email,
      canEditConfig: Boolean(payload.canEditConfig),
      canManualTrade: Boolean(payload.canManualTrade),
    };
  } catch {
    return null;
  }
}

// Rebuilds a Headers object with the trusted auth fields SET (overwriting,
// never trusting, any client-supplied header of the same name) — used by
// middleware.ts to pass a verified identity to route handlers without
// letting a client spoof it by sending its own x-can-edit-config header.
export function buildAuthHeaders(existingHeaders: Headers, payload: AuthTokenPayload): Headers {
  const headers = new Headers(existingHeaders);
  headers.set('x-user-id', payload.sub);
  headers.set('x-user-email', payload.email);
  headers.set('x-can-edit-config', String(payload.canEditConfig));
  headers.set('x-can-manual-trade', String(payload.canManualTrade));
  return headers;
}

export function getAuthContext(request: NextRequest): AuthContext | null {
  const userId = request.headers.get('x-user-id');
  const email = request.headers.get('x-user-email');
  if (!userId || !email) return null;
  return {
    userId,
    email,
    canEditConfig: request.headers.get('x-can-edit-config') === 'true',
    canManualTrade: request.headers.get('x-can-manual-trade') === 'true',
  };
}

export function requirePermission(
  context: AuthContext | null,
  permission: 'canEditConfig' | 'canManualTrade',
): NextResponse | null {
  if (!context || !context[permission]) {
    return NextResponse.json({ error: 'Forbidden — insufficient permission' }, { status: 403 });
  }
  return null;
}

// Used by the user-management routes to enforce that removing or demoting a
// user never leaves zero canEditConfig users in the system.
export async function hasAnotherConfigEditor(excludingUserId: string): Promise<boolean> {
  const remaining = await prisma.user.count({
    where: { canEditConfig: true, id: { not: excludingUserId } },
  });
  return remaining > 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest auth.test.ts
```

Expected: PASS, all tests green

- [ ] **Step 5: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint lib/auth.ts __tests__/auth.test.ts
```

Expected: both clean, no output

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts __tests__/auth.test.ts
git commit -m "feat: add JWT/password auth primitives in lib/auth.ts"
```

---

### Task 3: Root middleware protecting all API routes

**Files:**
- Create: `backend/middleware.ts`
- Test: `backend/__tests__/middleware.test.ts`

**Interfaces:**
- Consumes: `verifyToken`, `buildAuthHeaders` from `@/lib/auth` (Task 2)
- Produces: every `/api/*` route (except `/api/auth/login`) now requires a valid `Authorization: Bearer <token>` header, enforced before the route handler ever runs

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/middleware.test.ts`:

```typescript
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { signToken } from '@/lib/auth';

describe('middleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-value-at-least-32-bytes-long';
  });

  it('allows /api/auth/login through without a token', async () => {
    const request = new NextRequest('http://localhost/api/auth/login', { method: 'POST' });
    const response = await middleware(request);
    expect(response.status).toBe(200);
  });

  it('returns 401 when no Authorization header is present', async () => {
    const request = new NextRequest('http://localhost/api/bot/status');
    const response = await middleware(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 for a malformed bearer token', async () => {
    const request = new NextRequest('http://localhost/api/bot/status', {
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    const response = await middleware(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 when the Authorization header has no Bearer prefix', async () => {
    const token = await signToken({ sub: 'u1', email: 'a@b.com', canEditConfig: false, canManualTrade: false });
    const request = new NextRequest('http://localhost/api/bot/status', {
      headers: { authorization: token },
    });
    const response = await middleware(request);
    expect(response.status).toBe(401);
  });

  it('allows the request through for a valid token', async () => {
    const token = await signToken({ sub: 'u1', email: 'a@b.com', canEditConfig: true, canManualTrade: false });
    const request = new NextRequest('http://localhost/api/bot/status', {
      headers: { authorization: `Bearer ${token}` },
    });
    const response = await middleware(request);
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest middleware.test.ts
```

Expected: FAIL — `Cannot find module '../middleware'`

- [ ] **Step 3: Implement `backend/middleware.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, buildAuthHeaders } from '@/lib/auth';

export const config = {
  matcher: '/api/:path*',
};

const PUBLIC_PATHS = ['/api/auth/login'];

export async function middleware(request: NextRequest) {
  if (PUBLIC_PATHS.includes(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next({
    request: { headers: buildAuthHeaders(request.headers, payload) },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest middleware.test.ts
```

Expected: PASS, all 5 tests green

- [ ] **Step 5: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint middleware.ts __tests__/middleware.test.ts
```

Expected: both clean

- [ ] **Step 6: Commit**

```bash
git add middleware.ts __tests__/middleware.test.ts
git commit -m "feat: protect all API routes with JWT-verifying middleware"
```

---

### Task 4: Login and current-user endpoints

**Files:**
- Create: `backend/app/api/auth/login/route.ts`
- Create: `backend/app/api/auth/me/route.ts`
- Test: `backend/__tests__/auth-routes.test.ts`

**Interfaces:**
- Consumes: `hashPassword`/`verifyPassword`/`signToken`/`getAuthContext` from `@/lib/auth` (Task 2), `prisma.user` from `@/lib/prisma`
- Produces: `POST /api/auth/login` → `{ token: string, user: { id, email, canEditConfig, canManualTrade } }`; `GET /api/auth/me` → `{ id, email, canEditConfig, canManualTrade }`

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/auth-routes.test.ts`:

```typescript
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));
jest.mock('@/lib/auth', () => ({
  ...jest.requireActual('@/lib/auth'),
  verifyPassword: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, verifyToken } from '@/lib/auth';
import { POST as login } from '../app/api/auth/login/route';
import { GET as me } from '../app/api/auth/me/route';

const USER_ROW = {
  id: 'user-1',
  email: 'trader@example.com',
  passwordHash: 'hashed',
  canEditConfig: true,
  canManualTrade: false,
};

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-value-at-least-32-bytes-long';
    jest.clearAllMocks();
  });

  it('returns a token and user on valid credentials', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(USER_ROW);
    (verifyPassword as jest.Mock).mockResolvedValue(true);

    const response = await login(postRequest({ email: 'trader@example.com', password: 'correct-password' }));
    expect(response.status).toBe(200);
    const body = await response.json() as { token: string; user: { email: string } };
    expect(body.user.email).toBe('trader@example.com');
    const decoded = await verifyToken(body.token);
    expect(decoded?.sub).toBe('user-1');
  });

  it('lowercases the email before lookup', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(USER_ROW);
    (verifyPassword as jest.Mock).mockResolvedValue(true);

    await login(postRequest({ email: 'Trader@Example.com', password: 'correct-password' }));
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'trader@example.com' } });
  });

  it('returns 401 for an unknown email', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const response = await login(postRequest({ email: 'nobody@example.com', password: 'x' }));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an incorrect password', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(USER_ROW);
    (verifyPassword as jest.Mock).mockResolvedValue(false);
    const response = await login(postRequest({ email: 'trader@example.com', password: 'wrong' }));
    expect(response.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the user derived from the trusted request headers', async () => {
    const request = new NextRequest('http://localhost/api/auth/me', {
      headers: {
        'x-user-id': 'user-1',
        'x-user-email': 'trader@example.com',
        'x-can-edit-config': 'true',
        'x-can-manual-trade': 'false',
      },
    });
    const response = await me(request);
    expect(response.status).toBe(200);
    const body = await response.json() as { id: string; email: string };
    expect(body.id).toBe('user-1');
    expect(body.email).toBe('trader@example.com');
  });

  it('returns 401 when the trusted headers are absent (should not happen behind middleware, but defends the handler)', async () => {
    const request = new NextRequest('http://localhost/api/auth/me');
    const response = await me(request);
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest auth-routes.test.ts
```

Expected: FAIL — cannot find the route modules

- [ ] **Step 3: Implement `backend/app/api/auth/login/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, signToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const body = await request.json() as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const token = await signToken({
    sub: user.id,
    email: user.email,
    canEditConfig: user.canEditConfig,
    canManualTrade: user.canManualTrade,
  });

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      canEditConfig: user.canEditConfig,
      canManualTrade: user.canManualTrade,
    },
  });
}
```

- [ ] **Step 4: Implement `backend/app/api/auth/me/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const ctx = getAuthContext(request);
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    id: ctx.userId,
    email: ctx.email,
    canEditConfig: ctx.canEditConfig,
    canManualTrade: ctx.canManualTrade,
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx jest auth-routes.test.ts
```

Expected: PASS, all 6 tests green

- [ ] **Step 6: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint app/api/auth/login/route.ts app/api/auth/me/route.ts __tests__/auth-routes.test.ts
```

Expected: both clean

- [ ] **Step 7: Commit**

```bash
git add app/api/auth __tests__/auth-routes.test.ts
git commit -m "feat: add login and current-user auth endpoints"
```

---

### Task 5: First-admin seed script

**Files:**
- Create: `backend/prisma/seed.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `hashPassword` from `@/lib/auth` — but note this script is run standalone via `ts-node`, not through Next.js, so it uses a **relative** import (`../lib/auth`) rather than the `@/` path alias, since `ts-node` isn't configured with `tsconfig-paths` and adding that is unnecessary complexity for one script.

- [ ] **Step 1: Add the seed configuration to `package.json`**

Add this top-level key to `backend/package.json` (a sibling of `"dependencies"`, `"scripts"`, etc.):

```json
"prisma": {
  "seed": "ts-node --compiler-options {\"module\":\"CommonJS\",\"moduleResolution\":\"node\"} prisma/seed.ts"
}
```

- [ ] **Step 2: Write `backend/prisma/seed.ts`**

```typescript
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/auth';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required to seed the first admin');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user ${email} already exists — no changes made.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: { email, passwordHash, canEditConfig: true, canManualTrade: true },
  });
  console.log(`Created admin user ${email}.`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 3: Run it against the local dev database and verify**

```bash
npx prisma db seed
```

Expected: `Created admin user <your ADMIN_EMAIL>.`

Run it again to confirm idempotency:

```bash
npx prisma db seed
```

Expected: `Admin user <your ADMIN_EMAIL> already exists — no changes made.`

Verify the row directly:

```bash
psql "postgresql://localhost:5432/stratton_oakmont" -c 'SELECT email, "canEditConfig", "canManualTrade" FROM "User";'
```

Expected: one row, your admin email, both booleans `t`

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "feat: add one-time seed script for the first admin user"
```

---

### Task 6: User management CRUD endpoints

**Files:**
- Create: `backend/app/api/users/route.ts` (GET list, POST create)
- Create: `backend/app/api/users/[id]/route.ts` (PATCH update, DELETE)
- Create: `backend/app/api/users/[id]/reset-password/route.ts` (POST)
- Test: `backend/__tests__/users-routes.test.ts`

**Interfaces:**
- Consumes: `getAuthContext`, `requirePermission`, `hashPassword`, `hasAnotherConfigEditor` from `@/lib/auth` (Task 2), `prisma.user` from `@/lib/prisma`
- Produces: the five endpoints described in the design spec's User Management section

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/users-routes.test.ts`:

```typescript
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GET as listUsers, POST as createUser } from '../app/api/users/route';
import { PATCH as updateUser, DELETE as deleteUser } from '../app/api/users/[id]/route';
import { POST as resetPassword } from '../app/api/users/[id]/reset-password/route';

const EDITOR_HEADERS = {
  'x-user-id': 'editor-1',
  'x-user-email': 'editor@example.com',
  'x-can-edit-config': 'true',
  'x-can-manual-trade': 'false',
};
const VIEWER_HEADERS = {
  'x-user-id': 'viewer-1',
  'x-user-email': 'viewer@example.com',
  'x-can-edit-config': 'false',
  'x-can-manual-trade': 'false',
};

function req(url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: init.method ?? 'GET',
    headers: init.headers ?? EDITOR_HEADERS,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/users', () => {
  it('requires canEditConfig', async () => {
    const response = await listUsers(req('/api/users', { headers: VIEWER_HEADERS }));
    expect(response.status).toBe(403);
  });

  it('lists users without exposing passwordHash', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'u1', email: 'a@b.com', canEditConfig: true, canManualTrade: false, createdAt: new Date() },
    ]);
    const response = await listUsers(req('/api/users'));
    expect(response.status).toBe(200);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      select: { id: true, email: true, canEditConfig: true, canManualTrade: true, createdAt: true },
    });
  });
});

describe('POST /api/users', () => {
  it('requires canEditConfig', async () => {
    const response = await createUser(req('/api/users', {
      method: 'POST', headers: VIEWER_HEADERS,
      body: { email: 'new@example.com', password: 'longenough', canEditConfig: false, canManualTrade: false },
    }));
    expect(response.status).toBe(403);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const response = await createUser(req('/api/users', {
      method: 'POST',
      body: { email: 'new@example.com', password: 'short', canEditConfig: false, canManualTrade: false },
    }));
    expect(response.status).toBe(400);
  });

  it('rejects a duplicate email', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });
    const response = await createUser(req('/api/users', {
      method: 'POST',
      body: { email: 'dup@example.com', password: 'longenough', canEditConfig: false, canManualTrade: false },
    }));
    expect(response.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates a user with a hashed password on valid input', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({
      id: 'new1', email: 'new@example.com', canEditConfig: false, canManualTrade: true, createdAt: new Date(),
    });
    const response = await createUser(req('/api/users', {
      method: 'POST',
      body: { email: 'New@Example.com', password: 'longenough', canEditConfig: false, canManualTrade: true },
    }));
    expect(response.status).toBe(201);
    const createArgs = (prisma.user.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.email).toBe('new@example.com');
    expect(createArgs.data.passwordHash).not.toBe('longenough');
  });
});

describe('PATCH /api/users/:id', () => {
  it('requires canEditConfig', async () => {
    const response = await updateUser(
      req('/api/users/u1', { method: 'PATCH', headers: VIEWER_HEADERS, body: { canEditConfig: false } }),
      { params: { id: 'u1' } },
    );
    expect(response.status).toBe(403);
  });

  it('blocks revoking canEditConfig from the last remaining editor', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1', canEditConfig: true });
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    const response = await updateUser(
      req('/api/users/u1', { method: 'PATCH', body: { canEditConfig: false } }),
      { params: { id: 'u1' } },
    );
    expect(response.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows revoking canEditConfig when another editor remains', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1', canEditConfig: true });
    (prisma.user.count as jest.Mock).mockResolvedValue(1);
    (prisma.user.update as jest.Mock).mockResolvedValue({
      id: 'u1', email: 'a@b.com', canEditConfig: false, canManualTrade: false, createdAt: new Date(),
    });
    const response = await updateUser(
      req('/api/users/u1', { method: 'PATCH', body: { canEditConfig: false } }),
      { params: { id: 'u1' } },
    );
    expect(response.status).toBe(200);
  });
});

describe('DELETE /api/users/:id', () => {
  it('blocks deleting the last remaining editor', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1', canEditConfig: true });
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    const response = await deleteUser(req('/api/users/u1', { method: 'DELETE' }), { params: { id: 'u1' } });
    expect(response.status).toBe(400);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('deletes a non-last-editor user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1', canEditConfig: false });
    (prisma.user.delete as jest.Mock).mockResolvedValue({});
    const response = await deleteUser(req('/api/users/u1', { method: 'DELETE' }), { params: { id: 'u1' } });
    expect(response.status).toBe(200);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });
});

describe('POST /api/users/:id/reset-password', () => {
  it('rejects a password shorter than 8 characters', async () => {
    const response = await resetPassword(
      req('/api/users/u1/reset-password', { method: 'POST', body: { password: 'short' } }),
      { params: { id: 'u1' } },
    );
    expect(response.status).toBe(400);
  });

  it('hashes and saves the new password', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    const response = await resetPassword(
      req('/api/users/u1/reset-password', { method: 'POST', body: { password: 'longenough' } }),
      { params: { id: 'u1' } },
    );
    expect(response.status).toBe(200);
    const updateArgs = (prisma.user.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'u1' });
    expect(updateArgs.data.passwordHash).not.toBe('longenough');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest users-routes.test.ts
```

Expected: FAIL — cannot find the route modules

- [ ] **Step 3: Implement `backend/app/api/users/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthContext, requirePermission, hashPassword } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  const users = await prisma.user.findMany({
    select: { id: true, email: true, canEditConfig: true, canManualTrade: true, createdAt: true },
  });
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  const body = await request.json() as {
    email?: string;
    password?: string;
    canEditConfig?: boolean;
    canManualTrade?: boolean;
  };
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'a user with this email already exists' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      canEditConfig: body.canEditConfig ?? false,
      canManualTrade: body.canManualTrade ?? false,
    },
    select: { id: true, email: true, canEditConfig: true, canManualTrade: true, createdAt: true },
  });
  return NextResponse.json(user, { status: 201 });
}
```

- [ ] **Step 4: Implement `backend/app/api/users/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthContext, requirePermission, hasAnotherConfigEditor } from '@/lib/auth';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  const body = await request.json() as { email?: string; canEditConfig?: boolean; canManualTrade?: boolean };
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 });
  }

  if (body.canEditConfig === false && target.canEditConfig) {
    if (!(await hasAnotherConfigEditor(params.id))) {
      return NextResponse.json(
        { error: 'cannot remove the last remaining user with Edit Configuration access' },
        { status: 400 },
      );
    }
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(body.email !== undefined ? { email: body.email.trim().toLowerCase() } : {}),
      ...(body.canEditConfig !== undefined ? { canEditConfig: body.canEditConfig } : {}),
      ...(body.canManualTrade !== undefined ? { canManualTrade: body.canManualTrade } : {}),
    },
    select: { id: true, email: true, canEditConfig: true, canManualTrade: true, createdAt: true },
  });
  return NextResponse.json(user);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 });
  }

  if (target.canEditConfig && !(await hasAnotherConfigEditor(params.id))) {
    return NextResponse.json(
      { error: 'cannot delete the last remaining user with Edit Configuration access' },
      { status: 400 },
    );
  }

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ status: 'deleted' });
}
```

- [ ] **Step 5: Implement `backend/app/api/users/[id]/reset-password/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthContext, requirePermission, hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  const body = await request.json() as { password?: string };
  if (!body.password || body.password.length < 8) {
    return NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 });
  }

  const passwordHash = await hashPassword(body.password);
  await prisma.user.update({ where: { id: params.id }, data: { passwordHash } });
  return NextResponse.json({ status: 'password updated' });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx jest users-routes.test.ts
```

Expected: PASS, all 12 tests green

- [ ] **Step 7: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint app/api/users __tests__/users-routes.test.ts
```

Expected: both clean

- [ ] **Step 8: Commit**

```bash
git add app/api/users __tests__/users-routes.test.ts
git commit -m "feat: add user management CRUD endpoints"
```

---

### Task 7: Gate existing write endpoints with `canEditConfig`

**Files:**
- Modify: `backend/app/api/bot/config/route.ts`
- Modify: `backend/app/api/bot/start/route.ts`
- Modify: `backend/app/api/bot/stop/route.ts`
- Modify: `backend/app/api/settings/route.ts`
- Modify: `backend/app/api/ibkr-logout/route.ts`
- Modify: `backend/app/api/agent/run/route.ts`
- Test: `backend/__tests__/permission-gates.test.ts`

**Interfaces:**
- Consumes: `getAuthContext`, `requirePermission` from `@/lib/auth` (Task 2)

Each of the six files gets the same two-line addition at the top of its handler function(s) — for whichever HTTP method(s) that file exports. Below, "add after the imports and before the first line of the handler body" for each.

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/permission-gates.test.ts`. This mocks just enough of each route's dependencies that a permission-granted call doesn't throw, and asserts a permission-denied call returns `403` **without** reaching those dependencies:

```typescript
jest.mock('@/lib/prisma', () => ({
  prisma: {
    botConfig: { upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
    appSettings: { upsert: jest.fn().mockResolvedValue({}) },
  },
}));
jest.mock('@/lib/ibkr', () => ({
  ibkrClient: {
    startKeepAlive: jest.fn(),
    logout: jest.fn().mockResolvedValue(true),
  },
}));
jest.mock('@/lib/claude-agent', () => ({
  runAgentCycle: jest.fn().mockResolvedValue({ action: 'hold', quantity: 0, confidence: 0, reason: '', executed: false }),
}));
jest.mock('@/lib/bot-logger', () => ({ writeBotLog: jest.fn().mockResolvedValue(undefined) }));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ibkrClient } from '@/lib/ibkr';
import { runAgentCycle } from '@/lib/claude-agent';
import { POST as saveConfig } from '../app/api/bot/config/route';
import { POST as startBot } from '../app/api/bot/start/route';
import { POST as stopBot } from '../app/api/bot/stop/route';
import { PUT as saveSettings } from '../app/api/settings/route';
import { POST as ibkrLogout } from '../app/api/ibkr-logout/route';
import { POST as runAgentRoute } from '../app/api/agent/run/route';

const DENIED_HEADERS = {
  'x-user-id': 'u1', 'x-user-email': 'a@b.com', 'x-can-edit-config': 'false', 'x-can-manual-trade': 'false',
};
const ALLOWED_HEADERS = {
  'x-user-id': 'u1', 'x-user-email': 'a@b.com', 'x-can-edit-config': 'true', 'x-can-manual-trade': 'false',
};

// NOTE: /api/settings is a PUT endpoint (not POST, unlike the other five
// routes here) — verified against its current implementation before writing
// this test. Pass method explicitly per-call rather than assuming POST.
function req(url: string, headers: Record<string, string>, body: unknown = {}, method = 'POST') {
  return new NextRequest(`http://localhost${url}`, { method, headers, body: JSON.stringify(body) });
}

beforeEach(() => jest.clearAllMocks());

describe('canEditConfig gate on write routes', () => {
  it('POST /api/bot/config: 403 without permission, proceeds with it', async () => {
    const deniedRes = await saveConfig(req('/api/bot/config', DENIED_HEADERS, { market: 'MX', symbols: [], capitalLimit: 1, intervalMin: 15, confidenceThreshold: 0.6, takeProfitPct: 1, stopLossPct: 1, feeEstimatePct: 0.1 }));
    expect(deniedRes.status).toBe(403);
    expect(prisma.botConfig.upsert).not.toHaveBeenCalled();

    const allowedRes = await saveConfig(req('/api/bot/config', ALLOWED_HEADERS, { market: 'MX', symbols: [], capitalLimit: 1, intervalMin: 15, confidenceThreshold: 0.6, takeProfitPct: 1, stopLossPct: 1, feeEstimatePct: 0.1 }));
    expect(allowedRes.status).not.toBe(403);
    expect(prisma.botConfig.upsert).toHaveBeenCalled();
  });

  it('POST /api/bot/start: 403 without permission', async () => {
    const response = await startBot(req('/api/bot/start', DENIED_HEADERS, { market: 'MX', symbols: [], capitalLimit: 1, intervalMin: 15, confidenceThreshold: 0.6, takeProfitPct: 1, stopLossPct: 1, feeEstimatePct: 0.1 }));
    expect(response.status).toBe(403);
    expect(prisma.botConfig.upsert).not.toHaveBeenCalled();
  });

  it('POST /api/bot/stop: 403 without permission', async () => {
    const response = await stopBot(req('/api/bot/stop', DENIED_HEADERS, { market: 'MX' }));
    expect(response.status).toBe(403);
  });

  it('PUT /api/settings: 403 without permission', async () => {
    const response = await saveSettings(req('/api/settings', DENIED_HEADERS, { ibkrAccountId: 'U123' }, 'PUT'));
    expect(response.status).toBe(403);
    expect(prisma.appSettings.upsert).not.toHaveBeenCalled();
  });

  it('POST /api/ibkr-logout: 403 without permission', async () => {
    const response = await ibkrLogout(req('/api/ibkr-logout', DENIED_HEADERS));
    expect(response.status).toBe(403);
    expect(ibkrClient.logout).not.toHaveBeenCalled();
  });

  it('POST /api/agent/run: 403 without permission', async () => {
    const response = await runAgentRoute(req('/api/agent/run', DENIED_HEADERS, { symbol: 'AAPL', market: 'USA' }));
    expect(response.status).toBe(403);
    expect(runAgentCycle).not.toHaveBeenCalled();
  });

  it('POST /api/agent/run: proceeds with permission', async () => {
    const response = await runAgentRoute(req('/api/agent/run', ALLOWED_HEADERS, { symbol: 'AAPL', market: 'USA' }));
    expect(response.status).not.toBe(403);
    expect(runAgentCycle).toHaveBeenCalled();
  });
});
```

The request shapes above (including `/api/settings` being `PUT`, and `/api/ibkr-logout` taking no body) were verified against each route's current implementation while writing this plan.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest permission-gates.test.ts
```

Expected: FAIL — the denied-permission assertions fail because none of the routes check permissions yet (every call currently proceeds)

- [ ] **Step 3: Add the gate to each route**

For **`backend/app/api/bot/config/route.ts`**, add the import and the check as the first line of `POST`:

```typescript
import { getAuthContext, requirePermission } from '@/lib/auth';
// ...existing imports...

export async function POST(request: NextRequest) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  // ...existing handler body, unchanged...
}
```

Apply the identical pattern (import + two-line check as the first statement of the handler) to:
- `backend/app/api/bot/start/route.ts` — its `POST`
- `backend/app/api/bot/stop/route.ts` — its `POST`
- `backend/app/api/agent/run/route.ts` — its `POST`

For **`backend/app/api/settings/route.ts`**, the same pattern applies to its **`PUT`** handler (this route uses `PUT`, not `POST` — its `GET` is unaffected, view-only users can still read the current IBKR account ID):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ibkrClient } from '@/lib/ibkr';
import { getAuthContext, requirePermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  // ...existing GET handler, unchanged — no permission check, baseline (logged-in) access only...
}

export async function PUT(request: NextRequest) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  // ...existing PUT handler body, unchanged...
}
```

For **`backend/app/api/ibkr-logout/route.ts`**, its `POST` currently takes **no parameters at all** — `getAuthContext` needs a `NextRequest` to read headers from, so this route additionally needs a `request: NextRequest` parameter added (and the `NextRequest` import, not currently present):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ibkrClient } from '@/lib/ibkr';
import { getAuthContext, requirePermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  // ...existing handler body, unchanged...
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest permission-gates.test.ts
```

Expected: PASS, all 7 tests green

- [ ] **Step 5: Run the full backend suite to confirm nothing else broke**

```bash
npx jest
```

Expected: same pass/fail counts as before this task (the pre-existing, unrelated `databursatil.test.ts` failures are the only ones), plus the new tests passing

- [ ] **Step 6: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint app/api/bot/config/route.ts app/api/bot/start/route.ts app/api/bot/stop/route.ts app/api/settings/route.ts app/api/ibkr-logout/route.ts app/api/agent/run/route.ts __tests__/permission-gates.test.ts
```

Expected: both clean

- [ ] **Step 7: Commit**

```bash
git add app/api/bot/config/route.ts app/api/bot/start/route.ts app/api/bot/stop/route.ts app/api/settings/route.ts app/api/ibkr-logout/route.ts app/api/agent/run/route.ts __tests__/permission-gates.test.ts
git commit -m "feat: require canEditConfig on bot/settings/agent write endpoints"
```

---

### Task 8: Frontend auth core — model, service, interceptor, guard

**Files:**
- Create: `frontend/src/app/core/services/auth.service.ts`
- Test: `frontend/src/app/core/services/auth.service.spec.ts`
- Create: `frontend/src/app/core/interceptors/auth.interceptor.ts`
- Test: `frontend/src/app/core/interceptors/auth.interceptor.spec.ts`
- Create: `frontend/src/app/core/guards/auth.guard.ts`
- Test: `frontend/src/app/core/guards/auth.guard.spec.ts`
- Modify: `frontend/src/app/app.config.ts`

**Interfaces:**
- Produces:
  - `AuthService` (`@Injectable({ providedIn: 'root' })`) — `currentUser$: BehaviorSubject<AuthUser | null>`, `token: string | null` (getter), `isAuthenticated(): boolean`, `hasPermission(permission: 'canEditConfig' | 'canManualTrade'): boolean`, `login(email, password): Observable<AuthUser>`, `restoreSession(): Observable<AuthUser | null>`, `logout(): void`
  - `interface AuthUser { id: string; email: string; canEditConfig: boolean; canManualTrade: boolean; }`
  - `authInterceptor: HttpInterceptorFn`
  - `authGuard: CanActivateFn`

- [ ] **Step 1: Write the failing `AuthService` test**

Create `frontend/src/app/core/services/auth.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('starts unauthenticated with no stored token', () => {
    expect(service.isAuthenticated()).toBeFalse();
    expect(service.currentUser$.value).toBeNull();
  });

  it('stores the token and user on successful login', () => {
    service.login('trader@example.com', 'password123').subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    req.flush({ token: 'fake-token', user: { id: 'u1', email: 'trader@example.com', canEditConfig: true, canManualTrade: false } });

    expect(service.isAuthenticated()).toBeTrue();
    expect(service.token).toBe('fake-token');
    expect(service.currentUser$.value?.email).toBe('trader@example.com');
  });

  it('reports permissions from the current user', () => {
    service.login('trader@example.com', 'password123').subscribe();
    httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush({
      token: 'fake-token',
      user: { id: 'u1', email: 'trader@example.com', canEditConfig: true, canManualTrade: false },
    });
    expect(service.hasPermission('canEditConfig')).toBeTrue();
    expect(service.hasPermission('canManualTrade')).toBeFalse();
  });

  it('clears state on logout', () => {
    service.login('trader@example.com', 'password123').subscribe();
    httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush({
      token: 'fake-token',
      user: { id: 'u1', email: 'trader@example.com', canEditConfig: true, canManualTrade: false },
    });
    service.logout();
    expect(service.isAuthenticated()).toBeFalse();
    expect(service.currentUser$.value).toBeNull();
  });

  it('restoreSession clears an invalid stored token', () => {
    localStorage.setItem('auth_token', 'stale-token');
    service.restoreSession().subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
    req.flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    expect(service.isAuthenticated()).toBeFalse();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx ng test --watch=false --include='**/auth.service.spec.ts'
```

Expected: FAIL — `Cannot find module './auth.service'`

- [ ] **Step 3: Implement `frontend/src/app/core/services/auth.service.ts`**

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { tap, map, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  id: string;
  email: string;
  canEditConfig: boolean;
  canManualTrade: boolean;
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser$ = new BehaviorSubject<AuthUser | null>(null);
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {
    const storedUser = localStorage.getItem(USER_KEY);
    if (storedUser && this.token) {
      this.currentUser$.next(JSON.parse(storedUser) as AuthUser);
    }
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  hasPermission(permission: 'canEditConfig' | 'canManualTrade'): boolean {
    return this.currentUser$.value?.[permission] ?? false;
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, { email, password }).pipe(
      tap(res => this.setSession(res.token, res.user)),
      map(res => res.user),
    );
  }

  restoreSession(): Observable<AuthUser | null> {
    if (!this.token) return of(null);
    return this.http.get<AuthUser>(`${this.apiUrl}/auth/me`).pipe(
      tap(user => this.currentUser$.next(user)),
      catchError(() => {
        this.clearSession();
        return of(null);
      }),
    );
  }

  logout(): void {
    this.clearSession();
  }

  private setSession(token: string, user: AuthUser): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUser$.next(user);
  }

  private clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser$.next(null);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx ng test --watch=false --include='**/auth.service.spec.ts'
```

Expected: PASS, all 5 tests green

- [ ] **Step 5: Write the failing interceptor test**

Create `frontend/src/app/core/interceptors/auth.interceptor.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('attaches the bearer token to API requests when authenticated', () => {
    localStorage.setItem('auth_token', 'fake-token');
    http.get(`${environment.apiUrl}/bot/status`).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/bot/status`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
    req.flush({});
  });

  it('does not attach a header when there is no token', () => {
    localStorage.removeItem('auth_token');
    http.get(`${environment.apiUrl}/bot/status`).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/bot/status`);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('logs out on a 401 response from the API', () => {
    localStorage.setItem('auth_token', 'fake-token');
    const logoutSpy = spyOn(authService, 'logout');
    http.get(`${environment.apiUrl}/bot/status`).subscribe({ error: () => {} });
    const req = httpMock.expectOne(`${environment.apiUrl}/bot/status`);
    req.flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    expect(logoutSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
npx ng test --watch=false --include='**/auth.interceptor.spec.ts'
```

Expected: FAIL — `Cannot find module './auth.interceptor'`

- [ ] **Step 7: Implement `frontend/src/app/core/interceptors/auth.interceptor.ts`**

```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const isApiRequest = req.url.startsWith(environment.apiUrl);
  const token = authService.token;

  const authReq = isApiRequest && token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError(error => {
      if (isApiRequest && error?.status === 401) {
        authService.logout();
      }
      return throwError(() => error);
    }),
  );
};
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
npx ng test --watch=false --include='**/auth.interceptor.spec.ts'
```

Expected: PASS, all 3 tests green

- [ ] **Step 9: Write the failing guard test**

Create `frontend/src/app/core/guards/auth.guard.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let authServiceStub: { isAuthenticated: jasmine.Spy; hasPermission: jasmine.Spy };
  let router: Router;

  beforeEach(() => {
    authServiceStub = {
      isAuthenticated: jasmine.createSpy('isAuthenticated'),
      hasPermission: jasmine.createSpy('hasPermission'),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authServiceStub }],
    });
    router = TestBed.inject(Router);
  });

  function run(routeData: Record<string, unknown> = {}) {
    return TestBed.runInInjectionContext(() =>
      authGuard(
        { data: routeData } as unknown as ActivatedRouteSnapshot,
        { url: '/bot-config' } as unknown as RouterStateSnapshot,
      ),
    );
  }

  it('redirects to /login when not authenticated', () => {
    authServiceStub.isAuthenticated.and.returnValue(false);
    const result = run() as UrlTree;
    expect(result.toString()).toContain('/login');
  });

  it('allows access when authenticated and no permission is required', () => {
    authServiceStub.isAuthenticated.and.returnValue(true);
    expect(run()).toBeTrue();
  });

  it('redirects to /dashboard when authenticated but missing a required permission', () => {
    authServiceStub.isAuthenticated.and.returnValue(true);
    authServiceStub.hasPermission.and.returnValue(false);
    const result = run({ requiresPermission: 'canEditConfig' }) as UrlTree;
    expect(result.toString()).toContain('/dashboard');
  });

  it('allows access when authenticated and the required permission is present', () => {
    authServiceStub.isAuthenticated.and.returnValue(true);
    authServiceStub.hasPermission.and.returnValue(true);
    expect(run({ requiresPermission: 'canEditConfig' })).toBeTrue();
  });
});
```

- [ ] **Step 10: Run the test to verify it fails**

```bash
npx ng test --watch=false --include='**/auth.guard.spec.ts'
```

Expected: FAIL — `Cannot find module './auth.guard'`

- [ ] **Step 11: Implement `frontend/src/app/core/guards/auth.guard.ts`**

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  const requiredPermission = route.data['requiresPermission'] as 'canEditConfig' | 'canManualTrade' | undefined;
  if (requiredPermission && !authService.hasPermission(requiredPermission)) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};
```

- [ ] **Step 12: Run the test to verify it passes**

```bash
npx ng test --watch=false --include='**/auth.guard.spec.ts'
```

Expected: PASS, all 4 tests green

- [ ] **Step 13: Register the interceptor in `frontend/src/app/app.config.ts`**

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
  ],
};
```

- [ ] **Step 14: Run the full frontend test suite and typecheck**

```bash
npx ng test --watch=false
npx tsc --noEmit -p tsconfig.app.json
```

Expected: all tests pass (existing + 12 new), typecheck clean

- [ ] **Step 15: Commit**

```bash
git add src/app/core/services/auth.service.ts src/app/core/services/auth.service.spec.ts \
        src/app/core/interceptors/auth.interceptor.ts src/app/core/interceptors/auth.interceptor.spec.ts \
        src/app/core/guards/auth.guard.ts src/app/core/guards/auth.guard.spec.ts \
        src/app/app.config.ts
git commit -m "feat: add AuthService, auth interceptor, and route guard"
```

---

### Task 9: Login page

**Files:**
- Create: `frontend/src/app/login/login.component.ts`
- Create: `frontend/src/app/login/login.component.html`
- Create: `frontend/src/app/login/login.component.scss`
- Test: `frontend/src/app/login/login.component.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` (add the public `/login` route only — wiring the guard onto every other route is Task 10)

**Interfaces:**
- Consumes: `AuthService.login()` (Task 8)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/login/login.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../core/services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authServiceStub: { login: jasmine.Spy };
  let routerStub: { navigateByUrl: jasmine.Spy };

  beforeEach(async () => {
    authServiceStub = { login: jasmine.createSpy('login') };
    routerStub = { navigateByUrl: jasmine.createSpy('navigateByUrl') };

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: authServiceStub },
        { provide: Router, useValue: routerStub },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
  });

  it('navigates to /dashboard on successful login with no returnUrl', () => {
    authServiceStub.login.and.returnValue(of({ id: 'u1', email: 'a@b.com', canEditConfig: true, canManualTrade: false }));
    component.email = 'a@b.com';
    component.password = 'password123';
    component.submit();
    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('shows an error message on failed login', () => {
    authServiceStub.login.and.returnValue(throwError(() => ({ status: 401 })));
    component.email = 'a@b.com';
    component.password = 'wrong';
    component.submit();
    expect(component.errorMessage).toBe('Invalid email or password');
  });

  it('does not submit when the form is incomplete', () => {
    component.email = '';
    component.password = '';
    component.submit();
    expect(authServiceStub.login).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx ng test --watch=false --include='**/login.component.spec.ts'
```

Expected: FAIL — `Cannot find module './login.component'`

- [ ] **Step 3: Implement `frontend/src/app/login/login.component.ts`**

```typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatCardModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  email = '';
  password = '';
  errorMessage = '';
  submitting = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  submit(): void {
    this.errorMessage = '';
    if (!this.email || !this.password) return;

    this.submitting = true;
    this.authService.login(this.email, this.password).subscribe({
      next: () => {
        this.submitting = false;
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(returnUrl || '/dashboard');
      },
      error: () => {
        this.submitting = false;
        this.errorMessage = 'Invalid email or password';
      },
    });
  }
}
```

- [ ] **Step 4: Implement `frontend/src/app/login/login.component.html`**

```html
<div class="login-page">
  <mat-card class="login-card">
    <h1>Stratton Oakmont</h1>
    <form (ngSubmit)="submit()">
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Email</mat-label>
        <input matInput type="email" [(ngModel)]="email" name="email" autocomplete="username" required>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Password</mat-label>
        <input matInput type="password" [(ngModel)]="password" name="password" autocomplete="current-password" required>
      </mat-form-field>

      <p class="error-message" *ngIf="errorMessage">{{ errorMessage }}</p>

      <button mat-raised-button color="primary" type="submit" class="full-width" [disabled]="submitting">
        Log In
      </button>
    </form>
  </mat-card>
</div>
```

- [ ] **Step 5: Implement `frontend/src/app/login/login.component.scss`**

```scss
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 16px;
}

.login-card {
  width: 100%;
  max-width: 360px;
  padding: 24px;

  h1 {
    text-align: center;
    margin-bottom: 24px;
    font-size: 1.4rem;
  }
}

.full-width {
  width: 100%;
}

.error-message {
  color: var(--mat-sys-error, #d32f2f);
  font-size: 0.875rem;
  margin: 0 0 12px;
}
```

- [ ] **Step 6: Add the public `/login` route**

In `frontend/src/app/app.routes.ts`, add this route (existing routes are untouched in this task — the guard is applied to them in Task 10):

```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then(m => m.LoginComponent),
  },
  // ...existing routes unchanged below this line...
];
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
npx ng test --watch=false --include='**/login.component.spec.ts'
```

Expected: PASS, all 3 tests green

- [ ] **Step 8: Typecheck and build**

```bash
npx tsc --noEmit -p tsconfig.app.json
npx ng build --configuration development
```

Expected: both clean

- [ ] **Step 9: Commit**

```bash
git add src/app/login src/app/app.routes.ts
git commit -m "feat: add login page"
```

---

### Task 10: Wire the guard into every route, nav bar auth UI, Bot Config read-only gating

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.component.ts`
- Modify: `frontend/src/app/app.component.html`
- Test: `frontend/src/app/app.component.spec.ts` (extend the existing file)
- Modify: `frontend/src/app/bot-config/bot-config.component.ts`
- Modify: `frontend/src/app/bot-config/bot-config.component.html`

**Interfaces:**
- Consumes: `authGuard`, `AuthService` (Task 8)

- [ ] **Step 1: Apply `authGuard` to every route except `/login`, and mark `/bot-config` as requiring `canEditConfig`**

Rewrite `frontend/src/app/app.routes.ts` in full:

```typescript
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'trade-log',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./trade-log/trade-log.component').then(m => m.TradeLogComponent),
  },
  {
    path: 'bot-config',
    canActivate: [authGuard],
    data: { requiresPermission: 'canEditConfig' },
    loadComponent: () =>
      import('./bot-config/bot-config.component').then(m => m.BotConfigComponent),
  },
  {
    path: 'bot-logs',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./bot-logs/bot-logs-page.component').then(m => m.BotLogsPageComponent),
  },
  {
    path: 'agent-logs',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./agent-logs/agent-logs-page.component').then(m => m.AgentLogsPageComponent),
  },
  {
    path: 'pnl-history',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pnl-history/pnl-history.component').then(m => m.PnlHistoryComponent),
  },
];
```

(Note: Bot Config is `data: { requiresPermission: 'canEditConfig' }` per the approved design — a viewer hitting `/bot-config` directly is redirected to `/dashboard` by the guard, not shown a read-only page at that route. Combined with Step 3 below, in practice the Bot Config nav link is hidden from viewers anyway, so this is defense in depth. The `/users` route, added in Task 11, gets the same `data` block.)

- [ ] **Step 2: Add auth state, logout, and permission getters to `AppComponent`**

In `frontend/src/app/app.component.ts`, add the import and wire up `AuthService`:

```typescript
import { Component, OnInit, ViewChild } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { IbkrAuthService } from './core/services/ibkr-auth.service';
import { AuthService, AuthUser } from './core/services/auth.service';
import { IbkrAuthGateComponent } from './ibkr-auth-gate/ibkr-auth-gate.component';
import { MobileGestureDirective } from './shared/mobile-gesture.directive';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet, RouterLink, RouterLinkActive,
    MatSidenavModule, MatToolbarModule, MatListModule,
    MatIconModule, MatButtonModule, MatProgressSpinnerModule,
    IbkrAuthGateComponent,
    MobileGestureDirective,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'Stratton Oakmont';
  isMobile = false;
  pullDistance = 0;
  readonly pullThreshold = 70;

  @ViewChild('sidenav') sidenav!: MatSidenav;

  protected ibkrConnected$: Observable<boolean>;
  protected currentUser$: Observable<AuthUser | null>;

  constructor(
    private breakpointObserver: BreakpointObserver,
    private router: Router,
    private ibkrAuthService: IbkrAuthService,
    private authService: AuthService,
  ) {
    this.ibkrConnected$ = this.ibkrAuthService.connected$;
    this.currentUser$ = this.authService.currentUser$;
  }

  ngOnInit(): void {
    this.breakpointObserver.observe('(max-width: 768px)').subscribe(result => {
      this.isMobile = result.matches;
    });
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      if (this.isMobile && this.sidenav?.opened) {
        this.sidenav.close();
      }
    });
    this.ibkrAuthService.startPolling();
    this.authService.restoreSession().subscribe();
  }

  onPullChange(px: number): void {
    this.pullDistance = px;
  }

  onRefresh(): void {
    window.location.reload();
  }

  onSwipeOpen(): void {
    if (this.isMobile && !this.sidenav.opened) {
      this.sidenav.open();
    }
  }

  openIbkrLogin(): void {
    this.ibkrAuthService.openLoginModal();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }

  hasPermission(permission: 'canEditConfig' | 'canManualTrade'): boolean {
    return this.authService.hasPermission(permission);
  }
}
```

- [ ] **Step 3: Hide the Bot Config nav link for non-`canEditConfig` users, and add the user email + logout button to the toolbar**

In `frontend/src/app/app.component.html`, change the Bot Config nav item to be conditional, and add the auth section to the toolbar:

```html
<a mat-list-item routerLink="/bot-config" routerLinkActive="active-link" *ngIf="hasPermission('canEditConfig')">
  <mat-icon matListItemIcon>settings</mat-icon>
  <span matListItemTitle>Bot Config</span>
</a>
```

(replace the existing unconditional Bot Config `<a>` with the one above — the four items above it in the nav list are unchanged)

In the toolbar, right after the existing `.ibkr-status` closing `</div>`, add:

```html
      <div class="auth-status" *ngIf="currentUser$ | async as user">
        <span class="user-email">{{ user.email }}</span>
        <button mat-icon-button (click)="logout()" aria-label="Log out" matTooltip="Log out">
          <mat-icon>logout</mat-icon>
        </button>
      </div>
```

- [ ] **Step 4: Extend `frontend/src/app/app.component.spec.ts` for the new behavior**

Read the existing file first (`frontend/src/app/app.component.spec.ts`) to match its current provider-stubbing style, then add:

```typescript
it('hides the Bot Config nav link when the user lacks canEditConfig', () => {
  // configure the AuthService stub used by this spec's TestBed to return
  // false from hasPermission('canEditConfig'), then:
  fixture.detectChanges();
  const botConfigLink = fixture.nativeElement.querySelector('a[routerLink="/bot-config"]');
  expect(botConfigLink).toBeNull();
});

it('shows the Bot Config nav link when the user has canEditConfig', () => {
  // configure the stub to return true, then:
  fixture.detectChanges();
  const botConfigLink = fixture.nativeElement.querySelector('a[routerLink="/bot-config"]');
  expect(botConfigLink).not.toBeNull();
});
```

Wire these into the existing `TestBed.configureTestingModule` in that file by adding an `AuthService` stub provider (`{ provide: AuthService, useValue: { currentUser$: of(null), hasPermission: jasmine.createSpy(...).and.returnValue(...), restoreSession: () => of(null) } }`) alongside whatever `IbkrAuthService` stub is already there — match the existing file's exact stubbing conventions rather than introducing a new style.

- [ ] **Step 5: Gate the Bot Config page's fields and buttons for non-`canEditConfig` users**

In `frontend/src/app/bot-config/bot-config.component.ts`, inject `AuthService` and expose a `canEdit` getter:

```typescript
// add to the existing imports:
import { AuthService } from '../core/services/auth.service';

// add to the existing constructor parameter list:
private authService: AuthService,

// add as a new method on the class:
get canEdit(): boolean {
  return this.authService.hasPermission('canEditConfig');
}
```

In `frontend/src/app/bot-config/bot-config.component.html`, for each of the three market tabs: add `[disabled]="!canEdit"` to every `<input matInput ...>` and to the `mat-chip-listbox`/`mat-slide-toggle` elements, and wrap the Save button in `*ngIf="canEdit"`. Concretely, for the MX tab's status card (the same change applies identically to the USA and CRYPTO tabs' status cards):

```html
<mat-card class="config-card status-card">
  <mat-slide-toggle [(ngModel)]="mxConfig.isActive" color="primary" [disabled]="!canEdit">
    {{ mxConfig.isActive ? 'Active' : 'Inactive' }}
  </mat-slide-toggle>

  <button mat-raised-button color="primary" (click)="saveConfig('MX')" [disabled]="saving" *ngIf="canEdit">
    Save MX Configuration
  </button>
</mat-card>
```

- [ ] **Step 6: Run the full frontend test suite**

```bash
npx ng test --watch=false
```

Expected: all tests pass

- [ ] **Step 7: Typecheck and build**

```bash
npx tsc --noEmit -p tsconfig.app.json
npx ng build --configuration development
```

Expected: both clean

- [ ] **Step 8: Commit**

```bash
git add src/app/app.routes.ts src/app/app.component.ts src/app/app.component.html src/app/app.component.spec.ts \
        src/app/bot-config/bot-config.component.ts src/app/bot-config/bot-config.component.html
git commit -m "feat: guard all routes, add logout UI, gate Bot Config editing by permission"
```

---

### Task 11: User management page

**Files:**
- Create: `frontend/src/app/core/models/user.model.ts`
- Create: `frontend/src/app/core/services/user.service.ts`
- Test: `frontend/src/app/core/services/user.service.spec.ts`
- Create: `frontend/src/app/users/users.component.ts`
- Create: `frontend/src/app/users/users.component.html`
- Create: `frontend/src/app/users/users.component.scss`
- Test: `frontend/src/app/users/users.component.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` (add the `/users` route)
- Modify: `frontend/src/app/app.component.html` (add the nav link)

**Interfaces:**
- Consumes: `authGuard`, `AuthService` (Task 8)

- [ ] **Step 1: Create the model**

`frontend/src/app/core/models/user.model.ts`:

Deliberately a separate interface from Task 8's `AuthUser` (same three permission-related fields, plus `createdAt`) rather than extending it — `AuthUser` describes the logged-in session and lives in `auth.service.ts`; `ManagedUser` describes a row in the admin's user table. Keeping them independent means this task has no forward dependency on Task 8 touching its file, and the two really do answer different questions even though today their shapes overlap.

```typescript
export interface ManagedUser {
  id: string;
  email: string;
  canEditConfig: boolean;
  canManualTrade: boolean;
  createdAt: string;
}
```

- [ ] **Step 2: Write the failing `UserService` test**

`frontend/src/app/core/services/user.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { UserService } from './user.service';
import { environment } from '../../../environments/environment';

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists users', () => {
    service.list().subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('creates a user', () => {
    service.create({ email: 'a@b.com', password: 'longenough', canEditConfig: false, canManualTrade: true }).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('updates a user', () => {
    service.update('u1', { canEditConfig: false }).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/users/u1`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('resets a password', () => {
    service.resetPassword('u1', 'newlongpassword').subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/users/u1/reset-password`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('deletes a user', () => {
    service.delete('u1').subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/users/u1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd frontend && npx ng test --watch=false --include='**/user.service.spec.ts'
```

Expected: FAIL — `Cannot find module './user.service'`

- [ ] **Step 4: Implement `frontend/src/app/core/services/user.service.ts`**

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ManagedUser } from '../models/user.model';

export interface CreateUserPayload {
  email: string;
  password: string;
  canEditConfig: boolean;
  canManualTrade: boolean;
}

export interface UpdateUserPayload {
  email?: string;
  canEditConfig?: boolean;
  canManualTrade?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(): Observable<ManagedUser[]> {
    return this.http.get<ManagedUser[]>(`${this.apiUrl}/users`);
  }

  create(payload: CreateUserPayload): Observable<ManagedUser> {
    return this.http.post<ManagedUser>(`${this.apiUrl}/users`, payload);
  }

  update(id: string, payload: UpdateUserPayload): Observable<ManagedUser> {
    return this.http.patch<ManagedUser>(`${this.apiUrl}/users/${id}`, payload);
  }

  resetPassword(id: string, password: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/users/${id}/reset-password`, { password });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/users/${id}`);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx ng test --watch=false --include='**/user.service.spec.ts'
```

Expected: PASS, all 5 tests green

- [ ] **Step 6: Write the failing `UsersComponent` test**

`frontend/src/app/users/users.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { UsersComponent } from './users.component';
import { UserService } from '../core/services/user.service';
import { ManagedUser } from '../core/models/user.model';

describe('UsersComponent', () => {
  let component: UsersComponent;
  let fixture: ComponentFixture<UsersComponent>;
  let userServiceStub: {
    list: jasmine.Spy; create: jasmine.Spy; update: jasmine.Spy; resetPassword: jasmine.Spy; delete: jasmine.Spy;
  };

  const USERS: ManagedUser[] = [
    { id: 'u1', email: 'admin@example.com', canEditConfig: true, canManualTrade: true, createdAt: '2026-01-01T00:00:00.000Z' },
  ];

  beforeEach(async () => {
    userServiceStub = {
      list: jasmine.createSpy('list').and.returnValue(of(USERS)),
      create: jasmine.createSpy('create').and.returnValue(of(USERS[0])),
      update: jasmine.createSpy('update').and.returnValue(of(USERS[0])),
      resetPassword: jasmine.createSpy('resetPassword').and.returnValue(of(undefined)),
      delete: jasmine.createSpy('delete').and.returnValue(of(undefined)),
    };

    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [{ provide: UserService, useValue: userServiceStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance;
  });

  it('loads users on init', () => {
    fixture.detectChanges();
    expect(userServiceStub.list).toHaveBeenCalled();
    expect(component.users.length).toBe(1);
  });

  it('creates a user via the service and reloads the list', () => {
    fixture.detectChanges();
    component.newUser = { email: 'new@example.com', password: 'longenough', canEditConfig: false, canManualTrade: false };
    component.createUser();
    expect(userServiceStub.create).toHaveBeenCalledWith(component.newUser);
    expect(userServiceStub.list).toHaveBeenCalledTimes(2);
  });

  it('surfaces a backend error message on create failure', () => {
    userServiceStub.create.and.returnValue(
      throwError(() => ({ error: { error: 'a user with this email already exists' } })),
    );
    fixture.detectChanges();
    component.newUser = { email: 'dup@example.com', password: 'longenough', canEditConfig: false, canManualTrade: false };
    component.createUser();
    expect(component.errorMessage).toBe('a user with this email already exists');
  });

  it('deletes a user via the service and reloads the list', () => {
    fixture.detectChanges();
    component.deleteUser('u1');
    expect(userServiceStub.delete).toHaveBeenCalledWith('u1');
    expect(userServiceStub.list).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

```bash
npx ng test --watch=false --include='**/users.component.spec.ts'
```

Expected: FAIL — `Cannot find module './users.component'`

- [ ] **Step 8: Implement `frontend/src/app/users/users.component.ts`**

```typescript
import { Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { UserService, CreateUserPayload } from '../core/services/user.service';
import { ManagedUser } from '../core/models/user.model';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatCardModule, MatTableModule,
    MatFormFieldModule, MatInputModule, MatCheckboxModule, MatButtonModule, MatIconModule,
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class UsersComponent implements OnInit {
  users: ManagedUser[] = [];
  displayedColumns = ['email', 'canEditConfig', 'canManualTrade', 'createdAt', 'actions'];
  errorMessage = '';

  newUser: CreateUserPayload = { email: '', password: '', canEditConfig: false, canManualTrade: false };
  resetPasswordValue = '';
  resetPasswordTargetId: string | null = null;

  @ViewChild('createUserDialogTpl') createUserDialogTpl!: TemplateRef<unknown>;
  @ViewChild('resetPasswordDialogTpl') resetPasswordDialogTpl!: TemplateRef<unknown>;

  constructor(private userService: UserService, private dialog: MatDialog) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.userService.list().subscribe(users => (this.users = users));
  }

  openCreateDialog(): void {
    this.errorMessage = '';
    this.newUser = { email: '', password: '', canEditConfig: false, canManualTrade: false };
    this.dialog.open(this.createUserDialogTpl, { width: '90vw', maxWidth: '420px' });
  }

  createUser(): void {
    this.userService.create(this.newUser).subscribe({
      next: () => {
        this.dialog.closeAll();
        this.loadUsers();
      },
      error: err => {
        this.errorMessage = err?.error?.error ?? 'Failed to create user';
      },
    });
  }

  togglePermission(user: ManagedUser, permission: 'canEditConfig' | 'canManualTrade'): void {
    this.userService.update(user.id, { [permission]: !user[permission] }).subscribe({
      next: () => this.loadUsers(),
      error: err => {
        this.errorMessage = err?.error?.error ?? 'Failed to update user';
      },
    });
  }

  openResetPasswordDialog(userId: string): void {
    this.errorMessage = '';
    this.resetPasswordValue = '';
    this.resetPasswordTargetId = userId;
    this.dialog.open(this.resetPasswordDialogTpl, { width: '90vw', maxWidth: '360px' });
  }

  submitResetPassword(): void {
    if (!this.resetPasswordTargetId) return;
    this.userService.resetPassword(this.resetPasswordTargetId, this.resetPasswordValue).subscribe({
      next: () => this.dialog.closeAll(),
      error: err => {
        this.errorMessage = err?.error?.error ?? 'Failed to reset password';
      },
    });
  }

  deleteUser(id: string): void {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    this.userService.delete(id).subscribe({
      next: () => this.loadUsers(),
      error: err => {
        this.errorMessage = err?.error?.error ?? 'Failed to delete user';
      },
    });
  }
}
```

- [ ] **Step 9: Implement `frontend/src/app/users/users.component.html`**

```html
<h1>User Management</h1>

<p class="error-message" *ngIf="errorMessage">{{ errorMessage }}</p>

<mat-card class="users-card">
  <table mat-table [dataSource]="users" class="users-table">
    <ng-container matColumnDef="email">
      <th mat-header-cell *matHeaderCellDef>Email</th>
      <td mat-cell *matCellDef="let user">{{ user.email }}</td>
    </ng-container>

    <ng-container matColumnDef="canEditConfig">
      <th mat-header-cell *matHeaderCellDef>Edit Configuration</th>
      <td mat-cell *matCellDef="let user">
        <mat-checkbox [checked]="user.canEditConfig" (change)="togglePermission(user, 'canEditConfig')"></mat-checkbox>
      </td>
    </ng-container>

    <ng-container matColumnDef="canManualTrade">
      <th mat-header-cell *matHeaderCellDef>Manual Trade</th>
      <td mat-cell *matCellDef="let user">
        <mat-checkbox [checked]="user.canManualTrade" (change)="togglePermission(user, 'canManualTrade')"></mat-checkbox>
      </td>
    </ng-container>

    <ng-container matColumnDef="createdAt">
      <th mat-header-cell *matHeaderCellDef>Created</th>
      <td mat-cell *matCellDef="let user">{{ user.createdAt | date:'medium' }}</td>
    </ng-container>

    <ng-container matColumnDef="actions">
      <th mat-header-cell *matHeaderCellDef></th>
      <td mat-cell *matCellDef="let user">
        <button mat-icon-button (click)="openResetPasswordDialog(user.id)" aria-label="Reset password" matTooltip="Reset password">
          <mat-icon>key</mat-icon>
        </button>
        <button mat-icon-button (click)="deleteUser(user.id)" aria-label="Delete user" matTooltip="Delete user">
          <mat-icon>delete</mat-icon>
        </button>
      </td>
    </ng-container>

    <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
    <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
  </table>

  <button mat-raised-button color="primary" (click)="openCreateDialog()">Create User</button>
</mat-card>

<ng-template #createUserDialogTpl>
  <h2 mat-dialog-title>Create User</h2>
  <mat-dialog-content>
    <form>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Email</mat-label>
        <input matInput type="email" [(ngModel)]="newUser.email" name="email" required>
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Password</mat-label>
        <input matInput type="password" [(ngModel)]="newUser.password" name="password" required minlength="8">
      </mat-form-field>
      <mat-checkbox [(ngModel)]="newUser.canEditConfig" name="canEditConfig">Edit Configuration</mat-checkbox>
      <mat-checkbox [(ngModel)]="newUser.canManualTrade" name="canManualTrade">Manual Trade</mat-checkbox>
    </form>
  </mat-dialog-content>
  <mat-dialog-actions>
    <button mat-button mat-dialog-close>Cancel</button>
    <button mat-raised-button color="primary" (click)="createUser()">Create</button>
  </mat-dialog-actions>
</ng-template>

<ng-template #resetPasswordDialogTpl>
  <h2 mat-dialog-title>Reset Password</h2>
  <mat-dialog-content>
    <mat-form-field appearance="outline" class="full-width">
      <mat-label>New Password</mat-label>
      <input matInput type="password" [(ngModel)]="resetPasswordValue" name="resetPassword" minlength="8">
    </mat-form-field>
  </mat-dialog-content>
  <mat-dialog-actions>
    <button mat-button mat-dialog-close>Cancel</button>
    <button mat-raised-button color="primary" (click)="submitResetPassword()">Save</button>
  </mat-dialog-actions>
</ng-template>
```

- [ ] **Step 10: Implement `frontend/src/app/users/users.component.scss`**

```scss
.users-card {
  padding: 16px;
  margin-bottom: 16px;
}

.users-table {
  width: 100%;
  margin-bottom: 16px;
}

.full-width {
  width: 100%;
}

.error-message {
  color: var(--mat-sys-error, #d32f2f);
}
```

- [ ] **Step 11: Add the `/users` route**

In `frontend/src/app/app.routes.ts`, add (after the `bot-config` route entry):

```typescript
  {
    path: 'users',
    canActivate: [authGuard],
    data: { requiresPermission: 'canEditConfig' },
    loadComponent: () =>
      import('./users/users.component').then(m => m.UsersComponent),
  },
```

- [ ] **Step 12: Add the nav link**

In `frontend/src/app/app.component.html`, add this immediately after the (now-conditional) Bot Config nav link:

```html
<a mat-list-item routerLink="/users" routerLinkActive="active-link" *ngIf="hasPermission('canEditConfig')">
  <mat-icon matListItemIcon>group</mat-icon>
  <span matListItemTitle>Users</span>
</a>
```

- [ ] **Step 13: Run the full frontend test suite**

```bash
npx ng test --watch=false
```

Expected: all tests pass

- [ ] **Step 14: Typecheck and build**

```bash
npx tsc --noEmit -p tsconfig.app.json
npx ng build --configuration development
```

Expected: both clean

- [ ] **Step 15: Commit**

```bash
git add src/app/core/models/user.model.ts src/app/core/services/user.service.ts src/app/core/services/user.service.spec.ts \
        src/app/users src/app/app.routes.ts src/app/app.component.html
git commit -m "feat: add user management page"
```

---

### Task 12: End-to-end manual verification

**Files:** none — this task is a manual verification checklist, no code changes.

- [ ] **Step 1: Start both servers**

```bash
cd backend && npm run dev &
cd frontend && npx ng serve &
```

- [ ] **Step 2: Seed the first admin (if not already done in Task 5) and open the app**

Visit `http://localhost:4200` — expect an immediate redirect to `/login` (no token yet).

- [ ] **Step 3: Log in as the seeded admin**

Enter the `ADMIN_EMAIL`/`ADMIN_PASSWORD` from `.env.local`. Expect redirect to `/dashboard`, toolbar shows the admin's email, nav shows both Bot Config and Users links.

- [ ] **Step 4: Verify Bot Config is fully editable for the admin**

Navigate to Bot Config — fields are enabled, Save buttons are visible.

- [ ] **Step 5: Create a view-only user via the Users page**

Create a user with both permissions unchecked. Log out (toolbar logout button — expect redirect to `/login`). Log back in as the new view-only user.

- [ ] **Step 6: Verify view-only restrictions**

- Nav bar: no Bot Config or Users links visible.
- Dashboard, Trade Log, Bot Logs, Agent Logs, PnL History: all load normally (read access confirmed).
- Manually navigate to `http://localhost:4200/bot-config` — expect redirect to `/dashboard` (guard denies it).
- Manually navigate to `http://localhost:4200/users` — expect redirect to `/dashboard`.

- [ ] **Step 7: Verify the backend independently enforces this (not just the frontend)**

With the view-only user's token active (check DevTools → Application → Local Storage for the token), attempt a direct API call:

```bash
curl -i http://localhost:3000/api/bot/config -X POST -H "Authorization: Bearer <token-from-localstorage>" -H "Content-Type: application/json" -d '{}'
```

Expected: `403 Forbidden`

- [ ] **Step 8: Verify token expiry / invalid token handling**

In DevTools, edit the stored `auth_token` value to something invalid, then trigger any API call (e.g. refresh the dashboard). Expect the app to redirect to `/login` (interceptor's 401 handler firing).

- [ ] **Step 9: Verify the "last editor" guardrail**

Log back in as the admin. On the Users page, attempt to uncheck "Edit Configuration" on the admin's own row when it's the only `canEditConfig` user. Expect an error message and the checkbox to remain checked (the backend's 400 response should surface via `errorMessage`).

- [ ] **Step 10: Report results**

Note any deviations from the above expectations before considering this plan complete.
