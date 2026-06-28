# Stratton Oakmont Trading Bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fullstack automated personal trading application for Mexican (BMV) and US (NYSE/Nasdaq) markets, powered by a Claude AI agent that analyzes market data and executes trades via Interactive Brokers.

**Architecture:** The backend is a Next.js 14 App Router application exposing REST API routes; it hosts the Claude AI agent loop, IBKR session keep-alive, and all broker/market-data integrations. The frontend is an Angular 17 SPA with Angular Material that polls the backend for portfolio data and allows the user to configure and control the bot. All AI decisions and trade executions are logged to PostgreSQL via Prisma.

**Tech Stack:** Next.js 14 (App Router), Angular 17, Angular Material 17, TypeScript 5 (strict), PostgreSQL, Prisma 5, Anthropic SDK (`claude-sonnet-4-6`), Interactive Brokers Client Portal Web API (REST on localhost:5000), DataBursatil API.

## Global Constraints

- All code, comments, variable names, and documentation must be in English.
- TypeScript strict mode enabled in both frontend and backend.
- Never invest more than 20% of available capital in a single symbol.
- Never execute trades if Claude confidence < 0.65.
- Never trade outside the corresponding market's hours.
- Always use IBKR paper trading for development and testing.
- Backend port: 3000. Frontend dev port: 4200. IBKR Gateway: `https://localhost:5000`.
- Node.js >= 18. Angular CLI 17. Prisma 5.
- Phase 1 default market: MX (BMV). Phase 2 extends to USA (NYSE/Nasdaq) by changing `ACTIVE_MARKET=USA`.

---

## File Map

```
stratton_oakmont/
├── backend/                               # Next.js 14 App Router
│   ├── app/api/
│   │   ├── portfolio/route.ts             # GET positions and balance from IBKR
│   │   ├── trades/route.ts               # GET trade history from DB
│   │   ├── market-data/
│   │   │   ├── mx/route.ts               # GET BMV data via DataBursatil
│   │   │   └── usa/route.ts              # GET NYSE/Nasdaq data via IBKR
│   │   ├── bot/
│   │   │   ├── start/route.ts            # POST start bot cycle
│   │   │   ├── stop/route.ts             # POST stop bot cycle
│   │   │   └── status/route.ts           # GET bot running status
│   │   └── agent/run/route.ts            # POST trigger single agent cycle
│   ├── lib/
│   │   ├── prisma.ts                     # Singleton PrismaClient
│   │   ├── ibkr.ts                       # IBKR Client Portal API client
│   │   ├── databursatil.ts               # DataBursatil market data client
│   │   ├── market-hours.ts               # BMV and NYSE market-hours validation
│   │   ├── indicators.ts                 # RSI, MA, percentChange, volumeRatio
│   │   └── claude-agent.ts               # Agent cycle: fetch data → indicators → Claude → trade
│   ├── prisma/
│   │   └── schema.prisma
│   ├── __tests__/
│   │   ├── market-hours.test.ts
│   │   ├── indicators.test.ts
│   │   ├── databursatil.test.ts
│   │   └── ibkr.test.ts
│   ├── .env.local
│   ├── jest.config.ts
│   ├── next.config.ts
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                              # Angular 17 SPA
│   └── src/app/
│       ├── core/
│       │   ├── models/                   # TypeScript interfaces
│       │   │   ├── trade.model.ts
│       │   │   ├── portfolio.model.ts
│       │   │   ├── bot-config.model.ts
│       │   │   └── market-data.model.ts
│       │   └── services/
│       │       ├── portfolio.service.ts
│       │       ├── trade.service.ts
│       │       ├── market-data.service.ts
│       │       └── bot.service.ts
│       ├── dashboard/
│       │   ├── dashboard.component.ts
│       │   ├── dashboard.component.html
│       │   └── dashboard.component.scss
│       ├── trade-log/
│       │   ├── trade-log.component.ts
│       │   ├── trade-log.component.html
│       │   └── trade-log.component.scss
│       ├── bot-config/
│       │   ├── bot-config.component.ts
│       │   ├── bot-config.component.html
│       │   └── bot-config.component.scss
│       ├── app.routes.ts
│       ├── app.component.ts
│       └── app.component.html
│
└── docs/
    └── superpowers/
        └── plans/
            └── 2026-06-27-stratton-oakmont-trading-bot.md
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/next.config.ts`
- Create: `backend/jest.config.ts`
- Create: `backend/.env.local`
- Create: `frontend/` (Angular CLI generated)

**Interfaces:**
- Produces: Runnable Next.js backend at `localhost:3000`, Angular app scaffold at `localhost:4200`

- [ ] **Step 1: Create backend directory and initialize Next.js**

```bash
cd /Users/egarsev/Desktop/Stuff/code/stratton_oakmont
npx create-next-app@14 backend \
  --typescript \
  --eslint \
  --app \
  --no-tailwind \
  --no-src-dir \
  --import-alias "@/*"
```

Expected: `backend/` directory created with Next.js 14 App Router scaffold.

- [ ] **Step 2: Install backend dependencies**

```bash
cd backend
npm install @prisma/client @anthropic-ai/sdk date-fns-tz
npm install -D prisma jest ts-jest @types/jest @types/node
```

Expected: `node_modules/` populated, `package.json` updated.

- [ ] **Step 3: Configure Jest for backend**

Create `backend/jest.config.ts`:

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

export default config;
```

- [ ] **Step 4: Add jest script to backend package.json**

In `backend/package.json`, add to the `scripts` section:

```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 5: Create the .env.local file**

Create `backend/.env.local`:

```env
# Interactive Brokers (Client Portal Gateway runs locally on port 5000)
IBKR_GATEWAY_URL=https://localhost:5000/v1/api
IBKR_ACCOUNT_ID=your_account_id_here

# DataBursatil (MX market data)
DATABURSATIL_TOKEN=your_token_here

# Anthropic
ANTHROPIC_API_KEY=your_key_here

# PostgreSQL
DATABASE_URL=postgresql://usuario:password@localhost:5432/stratton_oakmont

# Active market: "MX" for Phase 1, "USA" for Phase 2
ACTIVE_MARKET=MX
```

- [ ] **Step 6: Initialize Angular frontend**

```bash
cd /Users/egarsev/Desktop/Stuff/code/stratton_oakmont
npx @angular/cli@17 new frontend \
  --routing \
  --style=scss \
  --skip-git \
  --skip-tests=false
cd frontend
ng add @angular/material
```

When prompted for Angular Material theme: choose `Indigo/Pink`. Enable animations: Yes. Set up global Angular Material typography: Yes.

- [ ] **Step 7: Install Angular dependencies**

```bash
cd frontend
npm install
```

Expected: Angular 17 project with Angular Material installed.

- [ ] **Step 8: Verify backend starts**

```bash
cd backend
npm run dev
```

Expected: `ready - started server on 0.0.0.0:3000`.

- [ ] **Step 9: Verify frontend compiles**

```bash
cd frontend
ng build --configuration=development
```

Expected: Build succeeds with no errors.

- [ ] **Step 10: Commit**

```bash
cd /Users/egarsev/Desktop/Stuff/code/stratton_oakmont
git init
git add backend/ frontend/ docs/
git commit -m "feat: scaffold Next.js backend and Angular frontend"
```

---

## Task 2: Prisma Schema and Database Setup

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `backend/lib/prisma.ts`

**Interfaces:**
- Produces: `prisma` singleton — `import { prisma } from '@/lib/prisma'`
- Produces: Three tables: `Trade`, `BotConfig`, `AgentLog`

- [ ] **Step 1: Initialize Prisma**

```bash
cd backend
npx prisma init --datasource-provider postgresql
```

Expected: `prisma/schema.prisma` created.

- [ ] **Step 2: Write the Prisma schema**

Replace the contents of `backend/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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
  createdAt   DateTime @default(now())
}

model BotConfig {
  id           String   @id @default(cuid())
  market       String   @unique // "MX" | "USA"
  symbols      String[]
  capitalLimit Float
  intervalMin  Int
  isActive     Boolean  @default(false)
  updatedAt    DateTime @updatedAt
}

model AgentLog {
  id         String   @id @default(cuid())
  symbol     String
  market     String
  marketData Json
  response   Json
  executed   Boolean  @default(false)
  createdAt  DateTime @default(now())
}
```

- [ ] **Step 3: Run migration**

```bash
cd backend
npx prisma migrate dev --name init
```

Expected: Migration created and applied. Tables `Trade`, `BotConfig`, `AgentLog` exist in PostgreSQL.

- [ ] **Step 4: Generate Prisma client**

```bash
cd backend
npx prisma generate
```

Expected: `@prisma/client` generated with typed models.

- [ ] **Step 5: Create the Prisma singleton**

Create `backend/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 6: Verify Prisma client works**

```bash
cd backend
npx prisma studio
```

Expected: Prisma Studio opens at `localhost:5555` showing the three empty tables. Close after verifying.

- [ ] **Step 7: Commit**

```bash
cd backend
git add prisma/ lib/prisma.ts
git commit -m "feat: add Prisma schema with Trade, BotConfig, AgentLog models"
```

---

## Task 3: Market Hours Validation

**Files:**
- Create: `backend/lib/market-hours.ts`
- Create: `backend/__tests__/market-hours.test.ts`

**Interfaces:**
- Produces: `isBMVOpen(): boolean` — true if current time is within BMV trading hours
- Produces: `isNYSEOpen(): boolean` — true if current time is within NYSE trading hours
- Produces: `isMarketOpen(market: 'MX' | 'USA'): boolean`

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/market-hours.test.ts`:

```typescript
import { isBMVOpen, isNYSEOpen, isMarketOpen } from '@/lib/market-hours';

// BMV: Mon-Fri 08:30-15:00 America/Mexico_City (UTC-6 standard, UTC-5 daylight)
// NYSE: Mon-Fri 09:30-16:00 America/New_York (UTC-5 standard, UTC-4 daylight)

describe('isBMVOpen', () => {
  afterEach(() => jest.useRealTimers());

  it('returns true on Monday at 10:00 Mexico City time', () => {
    // 2026-06-29 Monday, 10:00 Mexico City (UTC-5 in daylight) = 15:00 UTC
    jest.useFakeTimers({ now: new Date('2026-06-29T15:00:00Z') });
    expect(isBMVOpen()).toBe(true);
  });

  it('returns false before market open (08:00 Mexico City)', () => {
    // 2026-06-29 Monday, 08:00 Mexico City (UTC-5) = 13:00 UTC
    jest.useFakeTimers({ now: new Date('2026-06-29T13:00:00Z') });
    expect(isBMVOpen()).toBe(false);
  });

  it('returns false after market close (15:01 Mexico City)', () => {
    // 2026-06-29 Monday, 15:01 Mexico City (UTC-5) = 20:01 UTC
    jest.useFakeTimers({ now: new Date('2026-06-29T20:01:00Z') });
    expect(isBMVOpen()).toBe(false);
  });

  it('returns false on Saturday', () => {
    // 2026-06-27 Saturday, 10:00 Mexico City (UTC-5) = 15:00 UTC
    jest.useFakeTimers({ now: new Date('2026-06-27T15:00:00Z') });
    expect(isBMVOpen()).toBe(false);
  });

  it('returns false on Sunday', () => {
    jest.useFakeTimers({ now: new Date('2026-06-28T15:00:00Z') });
    expect(isBMVOpen()).toBe(false);
  });

  it('returns true at exactly 08:30 (market open)', () => {
    // 2026-06-29 Monday, 08:30 Mexico City (UTC-5) = 13:30 UTC
    jest.useFakeTimers({ now: new Date('2026-06-29T13:30:00Z') });
    expect(isBMVOpen()).toBe(true);
  });

  it('returns false at exactly 15:00 (market close)', () => {
    // 2026-06-29 Monday, 15:00 Mexico City (UTC-5) = 20:00 UTC
    jest.useFakeTimers({ now: new Date('2026-06-29T20:00:00Z') });
    expect(isBMVOpen()).toBe(false);
  });
});

describe('isNYSEOpen', () => {
  afterEach(() => jest.useRealTimers());

  it('returns true on Monday at 11:00 New York time', () => {
    // 2026-06-29 Monday, 11:00 New York (UTC-4 in EDT) = 15:00 UTC
    jest.useFakeTimers({ now: new Date('2026-06-29T15:00:00Z') });
    expect(isNYSEOpen()).toBe(true);
  });

  it('returns false on Saturday', () => {
    jest.useFakeTimers({ now: new Date('2026-06-27T15:00:00Z') });
    expect(isNYSEOpen()).toBe(false);
  });
});

describe('isMarketOpen', () => {
  afterEach(() => jest.useRealTimers());

  it('delegates to isBMVOpen for MX', () => {
    jest.useFakeTimers({ now: new Date('2026-06-29T15:00:00Z') });
    expect(isMarketOpen('MX')).toBe(isBMVOpen());
  });

  it('delegates to isNYSEOpen for USA', () => {
    jest.useFakeTimers({ now: new Date('2026-06-29T15:00:00Z') });
    expect(isMarketOpen('USA')).toBe(isNYSEOpen());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
npx jest __tests__/market-hours.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/market-hours'`

- [ ] **Step 3: Implement market-hours.ts**

Create `backend/lib/market-hours.ts`:

```typescript
type Market = 'MX' | 'USA';

function isWeekdayInRange(
  timezone: string,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number
): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(now).map(p => [p.type, p.value])
  );

  const weekday = parts['weekday'];
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const hour = parseInt(parts['hour'], 10);
  const minute = parseInt(parts['minute'], 10);
  const currentMinutes = hour * 60 + minute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function isBMVOpen(): boolean {
  return isWeekdayInRange('America/Mexico_City', 8, 30, 15, 0);
}

export function isNYSEOpen(): boolean {
  return isWeekdayInRange('America/New_York', 9, 30, 16, 0);
}

export function isMarketOpen(market: Market): boolean {
  return market === 'MX' ? isBMVOpen() : isNYSEOpen();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
npx jest __tests__/market-hours.test.ts
```

Expected: PASS — 9 tests passing.

- [ ] **Step 5: Commit**

```bash
cd backend
git add lib/market-hours.ts __tests__/market-hours.test.ts
git commit -m "feat: add market hours validation for BMV and NYSE"
```

---

## Task 4: Technical Indicators Library

**Files:**
- Create: `backend/lib/indicators.ts`
- Create: `backend/__tests__/indicators.test.ts`

**Interfaces:**
- Produces: `calculateRSI(prices: number[], period?: number): number`
- Produces: `calculateMA(prices: number[], period: number): number`
- Produces: `calculatePercentChange(prices: number[], days: number): number`
- Produces: `calculateVolumeRatio(volumes: number[], period?: number): number`
- Produces: `calculateIndicators(closePrices: number[], volumes: number[]): Indicators`
- Produces: `interface Indicators { rsi14: number; ma20: number; ma50: number; percentChange5d: number; volumeRatio: number; }`

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/indicators.test.ts`:

```typescript
import {
  calculateRSI,
  calculateMA,
  calculatePercentChange,
  calculateVolumeRatio,
  calculateIndicators,
} from '@/lib/indicators';

describe('calculateRSI', () => {
  it('returns 100 when all price changes are gains', () => {
    const prices = Array.from({ length: 16 }, (_, i) => 10 + i); // 10,11,12,...,25
    expect(calculateRSI(prices, 14)).toBe(100);
  });

  it('returns 0 when all price changes are losses', () => {
    const prices = Array.from({ length: 16 }, (_, i) => 25 - i); // 25,24,23,...,10
    expect(calculateRSI(prices, 14)).toBe(0);
  });

  it('returns 50 for neutral neutral price (no change)', () => {
    const prices = new Array(16).fill(100); // flat prices
    // avgLoss = 0, avgGain = 0 → RSI = 50 by convention
    expect(calculateRSI(prices, 14)).toBe(50);
  });

  it('returns value between 0 and 100 for mixed prices', () => {
    const prices = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.15,
                    43.61, 44.33, 44.83, 45.10, 45.15, 43.61, 44.33];
    const rsi = calculateRSI(prices, 14);
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(100);
  });

  it('returns 50 when insufficient data (less than period + 1 prices)', () => {
    expect(calculateRSI([100, 101, 102], 14)).toBe(50);
  });
});

describe('calculateMA', () => {
  it('returns the average of the last N prices', () => {
    const prices = [10, 20, 30, 40, 50];
    expect(calculateMA(prices, 3)).toBeCloseTo(40, 5); // avg of [30,40,50]
  });

  it('uses all prices when fewer than period', () => {
    const prices = [10, 20, 30];
    expect(calculateMA(prices, 5)).toBeCloseTo(20, 5); // avg of all 3
  });

  it('returns the single price when array has one element', () => {
    expect(calculateMA([42], 5)).toBe(42);
  });
});

describe('calculatePercentChange', () => {
  it('calculates 5-day percent change correctly', () => {
    const prices = [100, 102, 101, 103, 104, 110];
    // (110 - 100) / 100 * 100 = 10%
    expect(calculatePercentChange(prices, 5)).toBeCloseTo(10, 5);
  });

  it('returns 0 when not enough prices', () => {
    expect(calculatePercentChange([100, 102], 5)).toBe(0);
  });

  it('handles negative change', () => {
    const prices = [110, 108, 106, 104, 102, 100];
    expect(calculatePercentChange(prices, 5)).toBeCloseTo(-9.09, 1);
  });
});

describe('calculateVolumeRatio', () => {
  it('returns 2 when current volume is double the average', () => {
    const volumes = [...new Array(20).fill(100), 200]; // 20 days of 100, then 200
    expect(calculateVolumeRatio(volumes, 20)).toBeCloseTo(2, 5);
  });

  it('returns 1 when insufficient data', () => {
    expect(calculateVolumeRatio([100, 200], 20)).toBe(1);
  });
});

describe('calculateIndicators', () => {
  it('returns all indicator fields', () => {
    const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i) * 10);
    const volumes = new Array(60).fill(1_000_000);
    const result = calculateIndicators(prices, volumes);

    expect(result).toHaveProperty('rsi14');
    expect(result).toHaveProperty('ma20');
    expect(result).toHaveProperty('ma50');
    expect(result).toHaveProperty('percentChange5d');
    expect(result).toHaveProperty('volumeRatio');
    expect(typeof result.rsi14).toBe('number');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
npx jest __tests__/indicators.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/indicators'`

- [ ] **Step 3: Implement indicators.ts**

Create `backend/lib/indicators.ts`:

```typescript
export interface Indicators {
  rsi14: number;
  ma20: number;
  ma50: number;
  percentChange5d: number;
  volumeRatio: number;
}

export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  const changes = prices.slice(1).map((price, i) => price - prices[i]);
  const gains = changes.map(c => (c > 0 ? c : 0));
  const losses = changes.map(c => (c < 0 ? -c : 0));

  if (gains.every(g => g === 0) && losses.every(l => l === 0)) return 50;

  // Wilder's smoothed moving average
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  const slice = prices.length < period ? prices : prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function calculatePercentChange(prices: number[], days: number): number {
  if (prices.length < days + 1) return 0;
  const current = prices[prices.length - 1];
  const past = prices[prices.length - 1 - days];
  if (past === 0) return 0;
  return ((current - past) / past) * 100;
}

export function calculateVolumeRatio(volumes: number[], period: number = 20): number {
  if (volumes.length < period + 1) return 1;
  const current = volumes[volumes.length - 1];
  const historical = volumes.slice(-period - 1, -1);
  const avg = historical.reduce((a, b) => a + b, 0) / historical.length;
  return avg === 0 ? 1 : current / avg;
}

export function calculateIndicators(
  closePrices: number[],
  volumes: number[]
): Indicators {
  return {
    rsi14: calculateRSI(closePrices, 14),
    ma20: calculateMA(closePrices, 20),
    ma50: calculateMA(closePrices, 50),
    percentChange5d: calculatePercentChange(closePrices, 5),
    volumeRatio: calculateVolumeRatio(volumes, 20),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
npx jest __tests__/indicators.test.ts
```

Expected: PASS — all tests passing.

- [ ] **Step 5: Commit**

```bash
cd backend
git add lib/indicators.ts __tests__/indicators.test.ts
git commit -m "feat: add technical indicators library (RSI, MA, percentChange, volumeRatio)"
```

---

## Task 5: DataBursatil Client

**Files:**
- Create: `backend/lib/databursatil.ts`
- Create: `backend/__tests__/databursatil.test.ts`

**Interfaces:**
- Produces: `getMXMarketData(symbol: string): Promise<MXMarketData>`
- Produces: `interface MXMarketData { symbol: string; lastPrice: number; changePct: number; volume: number; history: { date: string; close: number; volume: number }[]; }`

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/databursatil.test.ts`:

```typescript
import { getMXMarketData } from '@/lib/databursatil';

global.fetch = jest.fn();

const mockIntradayResponse = {
  Serie: [
    {
      EmisioraSerie: 'AMXL',
      UltimoPrecio: 12.5,
      PorcentajeCambio: 1.23,
      Volumen: 1500000,
    },
  ],
};

const mockHistoricalResponse = {
  Serie: [
    { Fecha: '2026-05-01', UltimoPrecio: 11.0, Volumen: 1000000 },
    { Fecha: '2026-05-02', UltimoPrecio: 11.5, Volumen: 1200000 },
    { Fecha: '2026-06-27', UltimoPrecio: 12.5, Volumen: 1500000 },
  ],
};

describe('getMXMarketData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns correctly shaped MXMarketData for a valid symbol', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockIntradayResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockHistoricalResponse,
      });

    const data = await getMXMarketData('AMXL');

    expect(data.symbol).toBe('AMXL');
    expect(data.lastPrice).toBe(12.5);
    expect(data.changePct).toBe(1.23);
    expect(data.volume).toBe(1500000);
    expect(data.history).toHaveLength(3);
    expect(data.history[0]).toEqual({ date: '2026-05-01', close: 11.0, volume: 1000000 });
  });

  it('throws when the API returns an error status', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(getMXMarketData('AMXL')).rejects.toThrow('DataBursatil API error 401');
  });

  it('makes requests to the correct DataBursatil endpoints', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockIntradayResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => mockHistoricalResponse });

    await getMXMarketData('WALMEX');

    const [intradayCall, historicalCall] = (global.fetch as jest.Mock).mock.calls;
    expect(intradayCall[0]).toContain('intradia');
    expect(intradayCall[0]).toContain('WALMEX');
    expect(historicalCall[0]).toContain('historico');
    expect(historicalCall[0]).toContain('WALMEX');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
npx jest __tests__/databursatil.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/databursatil'`

- [ ] **Step 3: Implement databursatil.ts**

Create `backend/lib/databursatil.ts`:

```typescript
export interface MXMarketData {
  symbol: string;
  lastPrice: number;
  changePct: number;
  volume: number;
  history: { date: string; close: number; volume: number }[];
}

interface IntradayRecord {
  EmisioraSerie: string;
  UltimoPrecio: number;
  PorcentajeCambio: number;
  Volumen: number;
}

interface HistoricalRecord {
  Fecha: string;
  UltimoPrecio: number;
  Volumen: number;
}

const BASE_URL = 'https://api.databursatil.com/v2';

function getToken(): string {
  const token = process.env.DATABURSATIL_TOKEN;
  if (!token) throw new Error('DATABURSATIL_TOKEN environment variable is not set');
  return token;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

async function apiFetch<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DataBursatil API error ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export async function getMXMarketData(symbol: string): Promise<MXMarketData> {
  const token = getToken();
  const today = new Date().toISOString().split('T')[0];
  const sixtyDaysAgo = daysAgo(60);

  const [intraday, historical] = await Promise.all([
    apiFetch<{ Serie: IntradayRecord[] }>(
      `${BASE_URL}/intradia?token=${token}&emisora_serie=${symbol}&bolsa=BMV,BIVA`
    ),
    apiFetch<{ Serie: HistoricalRecord[] }>(
      `${BASE_URL}/historico?token=${token}&emisora_serie=${symbol}&periodo=diaria&desde=${sixtyDaysAgo}&hasta=${today}`
    ),
  ]);

  const latest = intraday.Serie[0];
  if (!latest) throw new Error(`No intraday data returned for symbol ${symbol}`);

  return {
    symbol,
    lastPrice: latest.UltimoPrecio,
    changePct: latest.PorcentajeCambio,
    volume: latest.Volumen,
    history: historical.Serie.map(r => ({
      date: r.Fecha,
      close: r.UltimoPrecio,
      volume: r.Volumen,
    })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
npx jest __tests__/databursatil.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
cd backend
git add lib/databursatil.ts __tests__/databursatil.test.ts
git commit -m "feat: add DataBursatil client for MX real-time and historical market data"
```

---

## Task 6: IBKR Client

**Files:**
- Create: `backend/lib/ibkr.ts`
- Create: `backend/__tests__/ibkr.test.ts`

**Interfaces:**
- Produces: `ibkrClient` singleton — `import { ibkrClient } from '@/lib/ibkr'`
- Produces: `ibkrClient.startKeepAlive(): void`
- Produces: `ibkrClient.stopKeepAlive(): void`
- Produces: `ibkrClient.getPositions(): Promise<IBKRPosition[]>`
- Produces: `ibkrClient.getAccountSummary(): Promise<AccountSummary>`
- Produces: `ibkrClient.placeOrder(params: PlaceOrderParams): Promise<string>` — returns orderId
- Produces:
  ```typescript
  interface IBKRPosition { conid: number; ticker: string; position: number; avgCost: number; mktValue: number; unrealizedPnl: number; }
  interface AccountSummary { availableFunds: number; buyingPower: number; currency: string; totalCashValue: number; netLiquidation: number; }
  interface PlaceOrderParams { conid: number; side: 'BUY' | 'SELL'; quantity: number; market: 'MX' | 'USA'; }
  ```

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/ibkr.test.ts`:

```typescript
import https from 'https';
import { IBKRClient } from '@/lib/ibkr';

// Mock the https module so no real network calls are made
jest.mock('https', () => ({
  Agent: jest.fn().mockImplementation(() => ({})),
  request: jest.fn(),
}));

function mockHttpsResponse(statusCode: number, body: unknown) {
  const mockResponse = {
    statusCode,
    on: jest.fn((event: string, cb: (data?: string) => void) => {
      if (event === 'data') cb(JSON.stringify(body));
      if (event === 'end') cb();
    }),
  };
  const mockRequest = {
    on: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  };
  (https.request as jest.Mock).mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
    callback(mockResponse);
    return mockRequest;
  });
  return mockRequest;
}

describe('IBKRClient', () => {
  let client: IBKRClient;

  beforeEach(() => {
    process.env.IBKR_GATEWAY_URL = 'https://localhost:5000/v1/api';
    process.env.IBKR_ACCOUNT_ID = 'TEST123';
    client = new IBKRClient();
    jest.clearAllMocks();
  });

  describe('getPositions', () => {
    it('returns an array of positions', async () => {
      const mockPositions = [
        { conid: 265598, ticker: 'AMXL', position: 100, avgCost: 12.0, mktValue: 1250, unrealizedPnl: 50 },
      ];
      mockHttpsResponse(200, mockPositions);

      const positions = await client.getPositions();

      expect(Array.isArray(positions)).toBe(true);
      expect(positions[0].ticker).toBe('AMXL');
    });
  });

  describe('getAccountSummary', () => {
    it('returns mapped account summary', async () => {
      const mockSummary = {
        availablefunds: { amount: 50000, currency: 'MXN' },
        buyingpower: { amount: 100000, currency: 'MXN' },
        totalcashvalue: { amount: 50000, currency: 'MXN' },
        netliquidation: { amount: 65000, currency: 'MXN' },
      };
      mockHttpsResponse(200, mockSummary);

      const summary = await client.getAccountSummary();

      expect(summary.availableFunds).toBe(50000);
      expect(summary.currency).toBe('MXN');
    });
  });

  describe('placeOrder', () => {
    it('returns the orderId for MX market order', async () => {
      mockHttpsResponse(200, [{ orderId: 'ORDER-001' }]);

      const orderId = await client.placeOrder({
        conid: 265598,
        side: 'BUY',
        quantity: 100,
        market: 'MX',
      });

      expect(orderId).toBe('ORDER-001');
    });

    it('returns the orderId for USA market order', async () => {
      mockHttpsResponse(200, [{ orderId: 'ORDER-002' }]);

      const orderId = await client.placeOrder({
        conid: 4815,
        side: 'SELL',
        quantity: 10,
        market: 'USA',
      });

      expect(orderId).toBe('ORDER-002');
    });
  });

  describe('keep-alive', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('calls /tickle every 55 seconds when keepAlive is started', () => {
      mockHttpsResponse(200, { session: '123' });

      client.startKeepAlive();
      jest.advanceTimersByTime(110_000); // advance 110s = 2 calls

      expect(https.request).toHaveBeenCalledTimes(2);
      client.stopKeepAlive();
    });

    it('stops calling /tickle after stopKeepAlive', () => {
      mockHttpsResponse(200, { session: '123' });

      client.startKeepAlive();
      jest.advanceTimersByTime(55_000);
      client.stopKeepAlive();
      jest.advanceTimersByTime(110_000); // no more calls

      expect(https.request).toHaveBeenCalledTimes(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
npx jest __tests__/ibkr.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/ibkr'`

- [ ] **Step 3: Implement ibkr.ts**

Create `backend/lib/ibkr.ts`:

```typescript
import https from 'https';

export interface IBKRPosition {
  conid: number;
  ticker: string;
  position: number;
  avgCost: number;
  mktValue: number;
  unrealizedPnl: number;
}

export interface AccountSummary {
  availableFunds: number;
  buyingPower: number;
  currency: string;
  totalCashValue: number;
  netLiquidation: number;
}

export interface PlaceOrderParams {
  conid: number;
  side: 'BUY' | 'SELL';
  quantity: number;
  market: 'MX' | 'USA';
}

export class IBKRClient {
  private readonly baseUrl: string;
  private readonly accountId: string;
  private readonly agent: https.Agent;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.baseUrl = process.env.IBKR_GATEWAY_URL ?? 'https://localhost:5000/v1/api';
    this.accountId = process.env.IBKR_ACCOUNT_ID ?? '';
    // IBKR Client Portal uses a self-signed certificate on localhost
    this.agent = new https.Agent({ rejectUnauthorized: false });
  }

  private request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}${path}`);
      const bodyStr = options.body ? JSON.stringify(options.body) : undefined;

      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: options.method ?? 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
          },
          agent: this.agent,
        },
        res => {
          let data = '';
          res.on('data', (chunk: string) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(data) as T);
            } else {
              reject(new Error(`IBKR API error ${res.statusCode}: ${data}`));
            }
          });
        }
      );

      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  startKeepAlive(): void {
    if (this.keepAliveInterval) return;
    this.keepAliveInterval = setInterval(() => {
      this.request('/tickle').catch(err => {
        console.error('[IBKR] Keep-alive tickle failed:', (err as Error).message);
      });
    }, 55_000);
  }

  stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  async getPositions(): Promise<IBKRPosition[]> {
    return this.request<IBKRPosition[]>(`/portfolio/${this.accountId}/positions/0`);
  }

  async getAccountSummary(): Promise<AccountSummary> {
    const raw = await this.request<Record<string, { amount: number; currency: string }>>(
      `/portfolio/${this.accountId}/summary`
    );
    return {
      availableFunds: raw['availablefunds']?.amount ?? 0,
      buyingPower: raw['buyingpower']?.amount ?? 0,
      currency: raw['availablefunds']?.currency ?? 'USD',
      totalCashValue: raw['totalcashvalue']?.amount ?? 0,
      netLiquidation: raw['netliquidation']?.amount ?? 0,
    };
  }

  async placeOrder(params: PlaceOrderParams): Promise<string> {
    const result = await this.request<{ orderId: string }[]>(
      `/iserver/account/${this.accountId}/orders`,
      {
        method: 'POST',
        body: {
          orders: [
            {
              acctId: this.accountId,
              conid: params.conid,
              orderType: 'MKT',
              side: params.side,
              quantity: params.quantity,
              tif: 'DAY',
              exchange: params.market === 'MX' ? 'BMV' : 'SMART',
              currency: params.market === 'MX' ? 'MXN' : 'USD',
            },
          ],
        },
      }
    );
    return result[0]?.orderId ?? '';
  }
}

export const ibkrClient = new IBKRClient();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
npx jest __tests__/ibkr.test.ts
```

Expected: PASS — all tests passing.

- [ ] **Step 5: Commit**

```bash
cd backend
git add lib/ibkr.ts __tests__/ibkr.test.ts
git commit -m "feat: add IBKR Client Portal client with keep-alive session management"
```

---

## Task 7: Claude Agent

**Files:**
- Create: `backend/lib/claude-agent.ts`

**Interfaces:**
- Consumes: `getMXMarketData` from `@/lib/databursatil`
- Consumes: `ibkrClient` from `@/lib/ibkr`
- Consumes: `calculateIndicators` from `@/lib/indicators`
- Consumes: `isMarketOpen` from `@/lib/market-hours`
- Consumes: `prisma` from `@/lib/prisma`
- Produces: `runAgentCycle(symbol: string, market: 'MX' | 'USA'): Promise<AgentCycleResult>`
- Produces: `interface AgentCycleResult { action: 'buy' | 'sell' | 'hold'; quantity: number; confidence: number; reason: string; executed: boolean; }`

- [ ] **Step 1: Install Anthropic SDK (if not already installed)**

```bash
cd backend
npm install @anthropic-ai/sdk
```

Expected: `@anthropic-ai/sdk` added to `node_modules/`.

- [ ] **Step 2: Create the Claude agent**

Create `backend/lib/claude-agent.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { getMXMarketData } from '@/lib/databursatil';
import { ibkrClient } from '@/lib/ibkr';
import { calculateIndicators } from '@/lib/indicators';
import { isMarketOpen } from '@/lib/market-hours';
import { prisma } from '@/lib/prisma';

export interface AgentCycleResult {
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  confidence: number;
  reason: string;
  executed: boolean;
}

interface ClaudeDecision {
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  confidence: number;
  reason: string;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPTS: Record<'MX' | 'USA', string> = {
  MX: `You are an expert trader on the Mexican Stock Exchange (BMV).
You know the Mexican market, its leading issuers (America Movil, FEMSA, Walmart de Mexico, Grupo Bimbo, Grupo Carso)
and the macroeconomic factors that affect it (USD/MXN exchange rate, Banxico rates, IPC index).
Your goal is to generate consistent returns in Mexican pesos with conservative risk management.
You MUST respond ONLY with valid JSON in this exact format:
{"action":"buy"|"sell"|"hold","quantity":0,"confidence":0.0,"reason":"..."}`,

  USA: `You are an expert trader on NYSE and Nasdaq.
Your goal is to generate consistent returns in US dollars with conservative risk management.
You MUST respond ONLY with valid JSON in this exact format:
{"action":"buy"|"sell"|"hold","quantity":0,"confidence":0.0,"reason":"..."}`,
};

function buildUserPrompt(
  symbol: string,
  market: 'MX' | 'USA',
  lastPrice: number,
  changePct: number,
  volume: number,
  indicators: ReturnType<typeof calculateIndicators>,
  currentPosition: number,
  availableFunds: number
): string {
  const maxInvestment = availableFunds * 0.20;
  const maxQuantity = Math.floor(maxInvestment / lastPrice);
  const currency = market === 'MX' ? 'MXN' : 'USD';

  return `Analyze the following market data for ${symbol} and decide whether to buy, sell, or hold.

MARKET DATA:
- Symbol: ${symbol}
- Last Price: ${lastPrice.toFixed(2)} ${currency}
- Day Change: ${changePct.toFixed(2)}%
- Volume: ${volume.toLocaleString()}

TECHNICAL INDICATORS:
- RSI (14): ${indicators.rsi14.toFixed(2)} (>70 overbought, <30 oversold)
- MA20: ${indicators.ma20.toFixed(2)} ${currency}
- MA50: ${indicators.ma50.toFixed(2)} ${currency}
- 5-Day Change: ${indicators.percentChange5d.toFixed(2)}%
- Volume Ratio vs 20-day avg: ${indicators.volumeRatio.toFixed(2)}x

PORTFOLIO:
- Current position in ${symbol}: ${currentPosition} shares
- Available funds: ${availableFunds.toFixed(2)} ${currency}
- Max allowed investment (20% rule): ${maxInvestment.toFixed(2)} ${currency}
- Max quantity you can buy: ${maxQuantity} shares

RULES:
- Never invest more than 20% of available funds in one symbol
- Set confidence = 0 if market conditions are unclear
- quantity must be 0 for "hold" action
- If selling, quantity must not exceed current position (${currentPosition})

Respond with JSON only.`;
}

export async function runAgentCycle(
  symbol: string,
  market: 'MX' | 'USA'
): Promise<AgentCycleResult> {
  if (!isMarketOpen(market)) {
    return { action: 'hold', quantity: 0, confidence: 0, reason: 'Market is closed', executed: false };
  }

  // Fetch market data
  let lastPrice: number;
  let changePct: number;
  let volume: number;
  let closePrices: number[];
  let volumes: number[];

  if (market === 'MX') {
    const data = await getMXMarketData(symbol);
    lastPrice = data.lastPrice;
    changePct = data.changePct;
    volume = data.volume;
    closePrices = data.history.map(h => h.close);
    volumes = data.history.map(h => h.volume);
  } else {
    // For USA market, IBKR market data would be fetched here.
    // Placeholder until IBKR market data endpoint is integrated.
    throw new Error('USA market data not yet implemented — set ACTIVE_MARKET=MX for Phase 1');
  }

  const indicators = calculateIndicators(closePrices, volumes);

  // Fetch portfolio state
  const [positions, summary] = await Promise.all([
    ibkrClient.getPositions(),
    ibkrClient.getAccountSummary(),
  ]);

  const currentPosition = positions.find(p => p.ticker === symbol)?.position ?? 0;
  const availableFunds = summary.availableFunds;

  // Call Claude
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: SYSTEM_PROMPTS[market],
    messages: [
      {
        role: 'user',
        content: buildUserPrompt(
          symbol, market, lastPrice, changePct, volume,
          indicators, currentPosition, availableFunds
        ),
      },
    ],
  });

  const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
  let decision: ClaudeDecision;
  try {
    decision = JSON.parse(rawText) as ClaudeDecision;
  } catch {
    decision = { action: 'hold', quantity: 0, confidence: 0, reason: `Parse error: ${rawText}` };
  }

  const marketData = { lastPrice, changePct, volume, indicators };
  let executed = false;
  let ibkrOrderId: string | undefined;

  // Execute trade if conditions are met
  if (
    (decision.action === 'buy' || decision.action === 'sell') &&
    decision.confidence >= 0.65 &&
    decision.quantity > 0
  ) {
    // Find conid — for BMV symbols we need the contract ID
    // In production this should be resolved via IBKR contract search
    const position = positions.find(p => p.ticker === symbol);
    const conid = position?.conid;

    if (conid) {
      ibkrOrderId = await ibkrClient.placeOrder({
        conid,
        side: decision.action === 'buy' ? 'BUY' : 'SELL',
        quantity: decision.quantity,
        market,
      });
      executed = true;
    }
  }

  // Persist to database
  await prisma.agentLog.create({
    data: {
      symbol,
      market,
      marketData,
      response: decision,
      executed,
    },
  });

  if (executed) {
    await prisma.trade.create({
      data: {
        symbol,
        market,
        action: decision.action,
        quantity: decision.quantity,
        price: lastPrice,
        currency: market === 'MX' ? 'MXN' : 'USD',
        reason: decision.reason,
        ibkrOrderId,
      },
    });
  }

  return { ...decision, executed };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd backend
npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd backend
git add lib/claude-agent.ts
git commit -m "feat: add Claude agent cycle with MX/USA differentiated prompts and trade execution"
```

---

## Task 8: API Routes

**Files:**
- Create: `backend/app/api/portfolio/route.ts`
- Create: `backend/app/api/trades/route.ts`
- Create: `backend/app/api/market-data/mx/route.ts`
- Create: `backend/app/api/market-data/usa/route.ts`
- Create: `backend/app/api/bot/start/route.ts`
- Create: `backend/app/api/bot/stop/route.ts`
- Create: `backend/app/api/bot/status/route.ts`
- Create: `backend/app/api/agent/run/route.ts`

**Interfaces:**
- Consumes: `ibkrClient` from `@/lib/ibkr`
- Consumes: `getMXMarketData` from `@/lib/databursatil`
- Consumes: `runAgentCycle` from `@/lib/claude-agent`
- Consumes: `prisma` from `@/lib/prisma`
- Produces: REST API endpoints consumed by Angular frontend

- [ ] **Step 1: Create the portfolio route**

Create `backend/app/api/portfolio/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { ibkrClient } from '@/lib/ibkr';

export async function GET() {
  try {
    const [positions, summary] = await Promise.all([
      ibkrClient.getPositions(),
      ibkrClient.getAccountSummary(),
    ]);
    return NextResponse.json({ positions, summary });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Create the trades route**

Create `backend/app/api/trades/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market') as 'MX' | 'USA' | null;
  const symbol = searchParams.get('symbol');
  const from = searchParams.get('from');

  const trades = await prisma.trade.findMany({
    where: {
      ...(market ? { market } : {}),
      ...(symbol ? { symbol } : {}),
      ...(from ? { createdAt: { gte: new Date(from) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json(trades);
}
```

- [ ] **Step 3: Create the MX market data route**

Create `backend/app/api/market-data/mx/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getMXMarketData } from '@/lib/databursatil';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'symbol query param is required' }, { status: 400 });
  }

  try {
    const data = await getMXMarketData(symbol);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create the USA market data route**

Create `backend/app/api/market-data/usa/route.ts`:

```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'USA market data (Phase 2) not yet implemented' },
    { status: 501 }
  );
}
```

- [ ] **Step 5: Create bot start/stop/status routes**

The bot runs as a server-side `setInterval`. Store the active intervals in a module-level map so they survive across requests within the same server process.

Create `backend/app/api/bot/start/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runAgentCycle } from '@/lib/claude-agent';
import { ibkrClient } from '@/lib/ibkr';

// Module-level interval map — persists across requests in the same server process
declare global {
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
        await runAgentCycle(symbol, market);
      } catch (err) {
        console.error(`[Bot] Agent cycle error for ${symbol}:`, (err as Error).message);
      }
    }
  }, intervalMin * 60_000);

  global.botIntervals.set(intervalKey, interval);

  return NextResponse.json({ status: 'started', config });
}
```

Create `backend/app/api/bot/stop/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const body = await request.json() as { market: 'MX' | 'USA' };
  const { market } = body;

  await prisma.botConfig.update({
    where: { market },
    data: { isActive: false },
  });

  const intervalKey = `bot-${market}`;
  if (global.botIntervals?.has(intervalKey)) {
    clearInterval(global.botIntervals.get(intervalKey));
    global.botIntervals.delete(intervalKey);
  }

  return NextResponse.json({ status: 'stopped', market });
}
```

Create `backend/app/api/bot/status/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market') as 'MX' | 'USA' | null;

  const configs = await prisma.botConfig.findMany({
    where: market ? { market } : {},
  });

  return NextResponse.json(configs);
}
```

- [ ] **Step 6: Create the manual agent run route**

Create `backend/app/api/agent/run/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { runAgentCycle } from '@/lib/claude-agent';

export async function POST(request: NextRequest) {
  const body = await request.json() as { symbol: string; market: 'MX' | 'USA' };
  const { symbol, market } = body;

  if (!symbol || !market) {
    return NextResponse.json({ error: 'symbol and market are required' }, { status: 400 });
  }

  try {
    const result = await runAgentCycle(symbol, market);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 7: Add CORS headers to Next.js config (Angular will call from port 4200)**

Edit `backend/next.config.ts`:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'http://localhost:4200' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 8: Verify backend compiles**

```bash
cd backend
npx tsc --noEmit
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
cd backend
git add app/api/ next.config.ts
git commit -m "feat: add all API routes (portfolio, trades, market-data, bot control, agent run)"
```

---

## Task 9: Angular Core Models and Services

**Files:**
- Create: `frontend/src/app/core/models/trade.model.ts`
- Create: `frontend/src/app/core/models/portfolio.model.ts`
- Create: `frontend/src/app/core/models/bot-config.model.ts`
- Create: `frontend/src/app/core/models/market-data.model.ts`
- Create: `frontend/src/app/core/services/portfolio.service.ts`
- Create: `frontend/src/app/core/services/trade.service.ts`
- Create: `frontend/src/app/core/services/market-data.service.ts`
- Create: `frontend/src/app/core/services/bot.service.ts`
- Modify: `frontend/src/app/app.config.ts`

**Interfaces:**
- Produces: All services injectable via Angular DI, consuming `http://localhost:3000/api`

- [ ] **Step 1: Create model interfaces**

Create `frontend/src/app/core/models/trade.model.ts`:

```typescript
export interface Trade {
  id: string;
  symbol: string;
  market: 'MX' | 'USA';
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  price: number;
  currency: 'MXN' | 'USD';
  reason: string;
  ibkrOrderId?: string;
  createdAt: string;
}
```

Create `frontend/src/app/core/models/portfolio.model.ts`:

```typescript
export interface Position {
  conid: number;
  ticker: string;
  position: number;
  avgCost: number;
  mktValue: number;
  unrealizedPnl: number;
}

export interface AccountSummary {
  availableFunds: number;
  buyingPower: number;
  currency: string;
  totalCashValue: number;
  netLiquidation: number;
}

export interface Portfolio {
  positions: Position[];
  summary: AccountSummary;
}
```

Create `frontend/src/app/core/models/bot-config.model.ts`:

```typescript
export interface BotConfig {
  id: string;
  market: 'MX' | 'USA';
  symbols: string[];
  capitalLimit: number;
  intervalMin: number;
  isActive: boolean;
  updatedAt: string;
}
```

Create `frontend/src/app/core/models/market-data.model.ts`:

```typescript
export interface MarketDataPoint {
  date: string;
  close: number;
  volume: number;
}

export interface MXMarketData {
  symbol: string;
  lastPrice: number;
  changePct: number;
  volume: number;
  history: MarketDataPoint[];
}
```

- [ ] **Step 2: Configure HttpClient in app.config.ts**

Edit `frontend/src/app/app.config.ts`:

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    provideAnimations(),
  ],
};
```

- [ ] **Step 3: Create PortfolioService**

Create `frontend/src/app/core/services/portfolio.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, startWith } from 'rxjs';
import { Portfolio } from '../models/portfolio.model';

@Injectable({ providedIn: 'root' })
export class PortfolioService {
  private readonly apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getPortfolio(): Observable<Portfolio> {
    return this.http.get<Portfolio>(`${this.apiUrl}/portfolio`);
  }

  pollPortfolio(intervalMs = 30_000): Observable<Portfolio> {
    return interval(intervalMs).pipe(
      startWith(0),
      switchMap(() => this.getPortfolio())
    );
  }
}
```

- [ ] **Step 4: Create TradeService**

Create `frontend/src/app/core/services/trade.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Trade } from '../models/trade.model';

export interface TradeFilters {
  market?: 'MX' | 'USA';
  symbol?: string;
  from?: string;
}

@Injectable({ providedIn: 'root' })
export class TradeService {
  private readonly apiUrl = 'http://localhost:3000/api';

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

- [ ] **Step 5: Create MarketDataService**

Create `frontend/src/app/core/services/market-data.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MXMarketData } from '../models/market-data.model';

@Injectable({ providedIn: 'root' })
export class MarketDataService {
  private readonly apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getMXData(symbol: string): Observable<MXMarketData> {
    const params = new HttpParams().set('symbol', symbol);
    return this.http.get<MXMarketData>(`${this.apiUrl}/market-data/mx`, { params });
  }
}
```

- [ ] **Step 6: Create BotService**

Create `frontend/src/app/core/services/bot.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BotConfig } from '../models/bot-config.model';

export interface StartBotPayload {
  market: 'MX' | 'USA';
  symbols: string[];
  capitalLimit: number;
  intervalMin: number;
}

@Injectable({ providedIn: 'root' })
export class BotService {
  private readonly apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getStatus(market?: 'MX' | 'USA'): Observable<BotConfig[]> {
    const url = market
      ? `${this.apiUrl}/bot/status?market=${market}`
      : `${this.apiUrl}/bot/status`;
    return this.http.get<BotConfig[]>(url);
  }

  startBot(payload: StartBotPayload): Observable<{ status: string; config: BotConfig }> {
    return this.http.post<{ status: string; config: BotConfig }>(
      `${this.apiUrl}/bot/start`,
      payload
    );
  }

  stopBot(market: 'MX' | 'USA'): Observable<{ status: string; market: string }> {
    return this.http.post<{ status: string; market: string }>(
      `${this.apiUrl}/bot/stop`,
      { market }
    );
  }
}
```

- [ ] **Step 7: Verify Angular compiles**

```bash
cd frontend
ng build --configuration=development
```

Expected: Build succeeds with no errors.

- [ ] **Step 8: Commit**

```bash
cd frontend
git add src/app/core/ src/app/app.config.ts
git commit -m "feat: add Angular core models and HTTP services for portfolio, trades, and bot"
```

---

## Task 10: Angular Dashboard Component

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.component.ts`
- Modify: `frontend/src/app/app.component.html`
- Create: `frontend/src/app/dashboard/dashboard.component.ts`
- Create: `frontend/src/app/dashboard/dashboard.component.html`
- Create: `frontend/src/app/dashboard/dashboard.component.scss`

**Interfaces:**
- Consumes: `PortfolioService`, `BotService` from `@/core/services`
- Produces: Routed Angular dashboard with market tabs, balance cards, positions table, bot control

- [ ] **Step 1: Set up application routes**

Edit `frontend/src/app/app.routes.ts`:

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

- [ ] **Step 2: Update app shell with sidenav**

Edit `frontend/src/app/app.component.ts`:

```typescript
import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatToolbarModule, MatListModule, MatIconModule],
  templateUrl: './app.component.html',
})
export class AppComponent {
  title = 'Stratton Oakmont';
}
```

Edit `frontend/src/app/app.component.html`:

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

- [ ] **Step 3: Create dashboard component**

Create `frontend/src/app/dashboard/dashboard.component.ts`:

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
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
    this.loadBotStatus();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  loadBotStatus(): void {
    this.botService.getStatus().subscribe({
      next: configs => { this.botConfigs = configs; },
    });
  }

  get activeBotConfig(): BotConfig | undefined {
    return this.botConfigs.find(c => c.market === this.activeMarket);
  }

  get isRunning(): boolean {
    return this.activeBotConfig?.isActive ?? false;
  }

  toggleBot(running: boolean): void {
    const config = this.activeBotConfig;
    if (running && config) {
      this.botService.startBot({
        market: this.activeMarket,
        symbols: config.symbols,
        capitalLimit: config.capitalLimit,
        intervalMin: config.intervalMin,
      }).subscribe(() => this.loadBotStatus());
    } else {
      this.botService.stopBot(this.activeMarket)
        .subscribe(() => this.loadBotStatus());
    }
  }

  get currency(): string {
    return this.activeMarket === 'MX' ? 'MXN' : 'USD';
  }
}
```

Create `frontend/src/app/dashboard/dashboard.component.html`:

```html
<div class="dashboard-header">
  <h1>Dashboard</h1>
  <div class="bot-control">
    <mat-chip [class.active]="isRunning">
      <mat-icon>{{ isRunning ? 'smart_toy' : 'stop' }}</mat-icon>
      {{ isRunning ? 'Bot Running' : 'Bot Stopped' }}
    </mat-chip>
    <mat-slide-toggle
      [checked]="isRunning"
      (change)="toggleBot($event.checked)"
      color="primary">
      {{ isRunning ? 'Stop' : 'Start' }} Bot
    </mat-slide-toggle>
  </div>
</div>

<mat-tab-group (selectedIndexChange)="activeMarket = $event === 0 ? 'MX' : 'USA'">
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
    {{ error }} — Is the IBKR Gateway running at localhost:5000?
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
  <table mat-table [dataSource]="portfolio?.positions ?? []" *ngIf="portfolio">
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
      <td mat-cell *matCellDef="let row" [class.positive]="row.unrealizedPnl > 0" [class.negative]="row.unrealizedPnl < 0">
        {{ row.unrealizedPnl | number:'1.2-2' }}
      </td>
    </ng-container>
    <tr mat-header-row *matHeaderRowDef="positionColumns"></tr>
    <tr mat-row *matRowDef="let row; columns: positionColumns;"></tr>
  </table>
</ng-template>
```

Create `frontend/src/app/dashboard/dashboard.component.scss`:

```scss
.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.bot-control {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cards-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin: 24px 0;
}

mat-card {
  flex: 1;
  min-width: 160px;
}

.amount {
  font-size: 28px;
  font-weight: 500;
  margin: 8px 0;
}

.loading-container {
  display: flex;
  justify-content: center;
  padding: 48px;
}

.error-card {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f44336;
  padding: 16px;
  border: 1px solid #f44336;
  border-radius: 4px;
  margin: 16px 0;
}

.positive { color: #4caf50; }
.negative { color: #f44336; }

.phase2-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: #757575;
}

table { width: 100%; }
```

- [ ] **Step 4: Verify Angular builds**

```bash
cd frontend
ng build --configuration=development
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/app/app.routes.ts src/app/app.component.* src/app/dashboard/
git commit -m "feat: add Angular dashboard with market tabs, balance cards, and bot toggle"
```

---

## Task 11: Trade Log and Bot Config Components

**Files:**
- Create: `frontend/src/app/trade-log/trade-log.component.ts`
- Create: `frontend/src/app/trade-log/trade-log.component.html`
- Create: `frontend/src/app/trade-log/trade-log.component.scss`
- Create: `frontend/src/app/bot-config/bot-config.component.ts`
- Create: `frontend/src/app/bot-config/bot-config.component.html`
- Create: `frontend/src/app/bot-config/bot-config.component.scss`

**Interfaces:**
- Consumes: `TradeService`, `BotService` from `@/core/services`

- [ ] **Step 1: Create Trade Log component**

Create `frontend/src/app/trade-log/trade-log.component.ts`:

```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { TradeService, TradeFilters } from '../core/services/trade.service';
import { Trade } from '../core/models/trade.model';

@Component({
  selector: 'app-trade-log',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatSelectModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatChipsModule,
  ],
  templateUrl: './trade-log.component.html',
  styleUrls: ['./trade-log.component.scss'],
})
export class TradeLogComponent implements OnInit {
  trades: Trade[] = [];
  loading = false;
  displayedColumns = ['createdAt', 'symbol', 'market', 'action', 'quantity', 'price', 'currency', 'reason'];

  filters: TradeFilters = {};
  marketFilter: 'MX' | 'USA' | '' = '';
  symbolFilter = '';

  constructor(private tradeService: TradeService) {}

  ngOnInit(): void {
    this.loadTrades();
  }

  loadTrades(): void {
    this.loading = true;
    const filters: TradeFilters = {
      ...(this.marketFilter ? { market: this.marketFilter as 'MX' | 'USA' } : {}),
      ...(this.symbolFilter ? { symbol: this.symbolFilter.toUpperCase() } : {}),
    };
    this.tradeService.getTrades(filters).subscribe({
      next: trades => { this.trades = trades; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  clearFilters(): void {
    this.marketFilter = '';
    this.symbolFilter = '';
    this.loadTrades();
  }

  getActionClass(action: string): string {
    return action === 'buy' ? 'action-buy' : action === 'sell' ? 'action-sell' : 'action-hold';
  }
}
```

Create `frontend/src/app/trade-log/trade-log.component.html`:

```html
<h1>Trade Log</h1>

<div class="filters-row">
  <mat-form-field appearance="outline">
    <mat-label>Market</mat-label>
    <mat-select [(ngModel)]="marketFilter" (ngModelChange)="loadTrades()">
      <mat-option value="">All</mat-option>
      <mat-option value="MX">MX — BMV</mat-option>
      <mat-option value="USA">USA — NYSE/Nasdaq</mat-option>
    </mat-select>
  </mat-form-field>

  <mat-form-field appearance="outline">
    <mat-label>Symbol</mat-label>
    <input matInput [(ngModel)]="symbolFilter" placeholder="e.g. AMXL" (keyup.enter)="loadTrades()">
    <mat-icon matSuffix>search</mat-icon>
  </mat-form-field>

  <button mat-stroked-button (click)="clearFilters()">
    <mat-icon>clear</mat-icon> Clear
  </button>
</div>

<table mat-table [dataSource]="trades" class="full-width">
  <ng-container matColumnDef="createdAt">
    <th mat-header-cell *matHeaderCellDef>Date</th>
    <td mat-cell *matCellDef="let row">{{ row.createdAt | date:'short' }}</td>
  </ng-container>
  <ng-container matColumnDef="symbol">
    <th mat-header-cell *matHeaderCellDef>Symbol</th>
    <td mat-cell *matCellDef="let row"><strong>{{ row.symbol }}</strong></td>
  </ng-container>
  <ng-container matColumnDef="market">
    <th mat-header-cell *matHeaderCellDef>Market</th>
    <td mat-cell *matCellDef="let row">{{ row.market }}</td>
  </ng-container>
  <ng-container matColumnDef="action">
    <th mat-header-cell *matHeaderCellDef>Action</th>
    <td mat-cell *matCellDef="let row">
      <span [class]="getActionClass(row.action)" class="action-chip">{{ row.action | uppercase }}</span>
    </td>
  </ng-container>
  <ng-container matColumnDef="quantity">
    <th mat-header-cell *matHeaderCellDef>Qty</th>
    <td mat-cell *matCellDef="let row">{{ row.quantity }}</td>
  </ng-container>
  <ng-container matColumnDef="price">
    <th mat-header-cell *matHeaderCellDef>Price</th>
    <td mat-cell *matCellDef="let row">{{ row.price | number:'1.2-2' }}</td>
  </ng-container>
  <ng-container matColumnDef="currency">
    <th mat-header-cell *matHeaderCellDef>Currency</th>
    <td mat-cell *matCellDef="let row">{{ row.currency }}</td>
  </ng-container>
  <ng-container matColumnDef="reason">
    <th mat-header-cell *matHeaderCellDef>Agent Reason</th>
    <td mat-cell *matCellDef="let row" class="reason-cell">{{ row.reason }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
  <tr *matNoDataRow>
    <td [colSpan]="displayedColumns.length" class="no-data">No trades found</td>
  </tr>
</table>
```

Create `frontend/src/app/trade-log/trade-log.component.scss`:

```scss
.filters-row {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.full-width { width: 100%; }

.action-chip {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.action-buy { background: #e8f5e9; color: #2e7d32; }
.action-sell { background: #ffebee; color: #c62828; }
.action-hold { background: #e3f2fd; color: #1565c0; }

.reason-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-data {
  text-align: center;
  padding: 32px;
  color: #757575;
}
```

- [ ] **Step 2: Create Bot Config component**

Create `frontend/src/app/bot-config/bot-config.component.ts`:

```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule, MatChipListboxChange } from '@angular/material/chips';
import { MatSliderModule } from '@angular/material/slider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BotService } from '../core/services/bot.service';
import { BotConfig } from '../core/models/bot-config.model';

const MX_SYMBOLS = ['AMXL', 'FEMSAUBD', 'WALMEX', 'BIMBOA', 'GCARSOA1'];
const USA_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'];

@Component({
  selector: 'app-bot-config',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTabsModule, MatChipsModule, MatSliderModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatSlideToggleModule, MatSnackBarModule,
  ],
  templateUrl: './bot-config.component.html',
  styleUrls: ['./bot-config.component.scss'],
})
export class BotConfigComponent implements OnInit {
  mxSymbols = MX_SYMBOLS;
  usaSymbols = USA_SYMBOLS;

  mxConfig: Partial<BotConfig> = { market: 'MX', symbols: ['AMXL'], capitalLimit: 10000, intervalMin: 15 };
  usaConfig: Partial<BotConfig> = { market: 'USA', symbols: ['AAPL'], capitalLimit: 1000, intervalMin: 15 };

  saving = false;

  constructor(private botService: BotService, private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    this.botService.getStatus().subscribe(configs => {
      const mx = configs.find(c => c.market === 'MX');
      const usa = configs.find(c => c.market === 'USA');
      if (mx) this.mxConfig = { ...mx };
      if (usa) this.usaConfig = { ...usa };
    });
  }

  onSymbolChange(event: MatChipListboxChange, market: 'MX' | 'USA'): void {
    const selected = Array.isArray(event.value) ? event.value : [event.value];
    if (market === 'MX') this.mxConfig.symbols = selected;
    else this.usaConfig.symbols = selected;
  }

  saveConfig(market: 'MX' | 'USA'): void {
    const config = market === 'MX' ? this.mxConfig : this.usaConfig;
    this.saving = true;

    const payload = {
      market,
      symbols: config.symbols ?? [],
      capitalLimit: config.capitalLimit ?? 10000,
      intervalMin: config.intervalMin ?? 15,
    };

    const action$ = config.isActive
      ? this.botService.startBot(payload)
      : this.botService.stopBot(market);

    action$.subscribe({
      next: () => {
        this.snackBar.open('Configuration saved', 'OK', { duration: 3000 });
        this.saving = false;
      },
      error: () => { this.saving = false; },
    });
  }
}
```

Create `frontend/src/app/bot-config/bot-config.component.html`:

```html
<h1>Bot Configuration</h1>

<mat-tab-group>
  <!-- MX Market Tab -->
  <mat-tab label="MX — BMV">
    <div class="config-section">
      <h3>Symbols (BMV IPC)</h3>
      <mat-chip-listbox
        multiple
        [value]="mxConfig.symbols"
        (change)="onSymbolChange($event, 'MX')">
        <mat-chip-option *ngFor="let s of mxSymbols" [value]="s">{{ s }}</mat-chip-option>
      </mat-chip-listbox>

      <h3>Capital Limit per Cycle (MXN)</h3>
      <mat-form-field appearance="outline">
        <mat-label>Capital Limit (MXN)</mat-label>
        <input matInput type="number" [(ngModel)]="mxConfig.capitalLimit" min="1000">
      </mat-form-field>

      <h3>Check Frequency</h3>
      <mat-form-field appearance="outline">
        <mat-label>Interval (minutes)</mat-label>
        <input matInput type="number" [(ngModel)]="mxConfig.intervalMin" min="1" max="1440">
      </mat-form-field>

      <div class="toggle-row">
        <mat-slide-toggle [(ngModel)]="mxConfig.isActive" color="primary">
          {{ mxConfig.isActive ? 'Active' : 'Inactive' }}
        </mat-slide-toggle>
      </div>

      <button mat-raised-button color="primary" (click)="saveConfig('MX')" [disabled]="saving">
        Save MX Configuration
      </button>
    </div>
  </mat-tab>

  <!-- USA Market Tab -->
  <mat-tab label="USA — NYSE/Nasdaq">
    <div class="config-section">
      <div class="phase2-banner">
        <strong>Phase 2</strong> — Set ACTIVE_MARKET=USA in backend .env to enable.
      </div>

      <h3>Symbols (NYSE/Nasdaq)</h3>
      <mat-chip-listbox
        multiple
        [value]="usaConfig.symbols"
        (change)="onSymbolChange($event, 'USA')">
        <mat-chip-option *ngFor="let s of usaSymbols" [value]="s">{{ s }}</mat-chip-option>
      </mat-chip-listbox>

      <h3>Capital Limit per Cycle (USD)</h3>
      <mat-form-field appearance="outline">
        <mat-label>Capital Limit (USD)</mat-label>
        <input matInput type="number" [(ngModel)]="usaConfig.capitalLimit" min="100">
      </mat-form-field>

      <h3>Check Frequency</h3>
      <mat-form-field appearance="outline">
        <mat-label>Interval (minutes)</mat-label>
        <input matInput type="number" [(ngModel)]="usaConfig.intervalMin" min="1" max="1440">
      </mat-form-field>

      <div class="toggle-row">
        <mat-slide-toggle [(ngModel)]="usaConfig.isActive" color="primary">
          {{ usaConfig.isActive ? 'Active' : 'Inactive' }}
        </mat-slide-toggle>
      </div>

      <button mat-raised-button color="primary" (click)="saveConfig('USA')" [disabled]="saving">
        Save USA Configuration
      </button>
    </div>
  </mat-tab>
</mat-tab-group>
```

Create `frontend/src/app/bot-config/bot-config.component.scss`:

```scss
.config-section {
  padding: 24px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 560px;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.phase2-banner {
  background: #fff3e0;
  border: 1px solid #ffe0b2;
  border-radius: 4px;
  padding: 12px 16px;
  color: #e65100;
}

mat-form-field {
  width: 100%;
}
```

- [ ] **Step 3: Final Angular build**

```bash
cd frontend
ng build --configuration=development
```

Expected: Build succeeds with no TypeScript or template errors.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/app/trade-log/ src/app/bot-config/
git commit -m "feat: add Trade Log and Bot Config components"
```

---

## Self-Review

**Spec coverage check:**

| Spec Requirement | Task |
|---|---|
| Phase 1 BMV symbols (AMXL, FEMSAUBD, WALMEX, BIMBOA, GCARSOA1) | Task 11 (Bot Config) |
| Phase 2 USA market extension | Task 7 (placeholder), Task 11 (USA tab) |
| IBKR Client Portal API with keep-alive | Task 6 |
| DataBursatil intraday + 60-day history | Task 5 |
| BMV and NYSE market hours validation | Task 3 |
| RSI(14), MA20, MA50, 5-day change, volume ratio | Task 4 |
| Claude agent with differentiated MX/USA prompts | Task 7 |
| 20% capital limit per symbol | Task 7 (buildUserPrompt) |
| Confidence < 0.65 gate | Task 7 (runAgentCycle) |
| Market hours gate before order | Task 7 (runAgentCycle) |
| Trade, BotConfig, AgentLog Prisma schema | Task 2 |
| All AgentLog cycles saved (including hold) | Task 7 |
| Portfolio API (positions + balance) | Task 8 |
| Trades API with filters | Task 8 |
| Bot start/stop/status API | Task 8 |
| Agent run API | Task 8 |
| Angular Dashboard with market tabs | Task 10 |
| Balance/buying power/P&L cards | Task 10 |
| Positions table | Task 10 |
| Bot On/Off toggle | Task 10 |
| Trade Log with filters | Task 11 |
| Bot Config with symbol chips, capital, frequency | Task 11 |
| IBKR Gateway keep-alive every 55s | Task 6, Task 8 (bot/start) |
| CORS for Angular on port 4200 | Task 8 |

**Gaps:** The `conid` (IBKR contract ID) resolution for placing orders is not fully automated — in Task 7 the code looks up the conid from existing positions. For new symbols not yet held, you would need to call IBKR's contract search endpoint (`/iserver/secdef/search`). This is a known Phase 1 limitation — start with symbols already in your IBKR paper trading account.

---

## Prerequisites Before Running

1. **IBKR Gateway:** Download Client Portal Gateway JAR from interactivebrokers.com/api. Run:
   ```bash
   java -jar root/run.jar root/conf.yaml
   ```
   Then authenticate at `https://localhost:5000` with IBKR credentials. Use paper trading account.

2. **DataBursatil token:** Register at databursatil.com (free tier is sufficient for MVP).

3. **Anthropic API key:** Get from console.anthropic.com.

4. **PostgreSQL:** Create database `stratton_oakmont` and update `DATABASE_URL` in `backend/.env.local`.

5. **Run migrations:** `cd backend && npx prisma migrate dev`

6. **Run backend:** `cd backend && npm run dev` (port 3000)

7. **Run frontend:** `cd frontend && ng serve` (port 4200)

8. **Test paper trading:** Start with AMXL, run a single agent cycle via `POST /api/agent/run { "symbol": "AMXL", "market": "MX" }` and verify the AgentLog in Prisma Studio before enabling the automated bot loop.
