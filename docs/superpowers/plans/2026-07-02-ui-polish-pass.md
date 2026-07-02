# UI/UX Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure five Angular frontend pages (typography, Agent Logs, Bot Config, Trade Log, Bot Logs) to fix odd space usage and weak visual hierarchy flagged by the user, while keeping the existing color palette and working well on both desktop and the iPhone-hosted Capacitor build.

**Architecture:** Pure frontend layout/template/SCSS work inside `frontend/src/`. Agent Logs moves from an inline-expand list to a master-detail split view (desktop) / list-then-full-screen-detail (mobile), reusing the existing `BreakpointObserver` pattern already established in `app.component.ts`. Bot Config wraps existing sections into three `mat-card` blocks. Trade Log adds a content-aware empty/sparse-state footer and a mobile card fallback. Bot Logs gets a one-line CSS addition. Global typography swaps to Fira Sans + Fira Code via `index.html` and Angular Material's typography config in `styles.scss`.

**Tech Stack:** Angular 17 (standalone components), Angular Material 17, Angular CDK `BreakpointObserver`, Jasmine/Karma for the two components gaining new testable logic (Agent Log selection state, Trade Log footer copy).

## Global Constraints

- No changes to `--bg-base`, `--bg-surface`, `--bg-sidebar`, `--accent`, `--text-primary`, `--text-muted`, `--green`, `--red`, `--border` token values.
- No changes to business logic, API routes, Prisma models, or the Claude agent prompt (backend untouched).
- Respect the existing `@media (max-width: 768px)` breakpoint convention already used throughout `frontend/src/` — do not introduce a new breakpoint value.
- No new Angular routes. Mobile "detail" views are component-local view state, not routed views — this app does not do per-item deep-linking anywhere today, and this plan doesn't add it.
- Follow existing codebase convention: components here have no pre-existing `.spec.ts` files. Only add spec files where a task introduces genuinely new, non-trivial logic (state transitions, computed text) — not for pure template/SCSS restructuring, which is verified by building and visually checking the running app instead (this project's established practice for UI changes, per its `verify` skill usage).

---

## File Structure

| File | Change |
|---|---|
| `frontend/src/index.html` | Modify — swap Google Fonts link from Roboto to Fira Sans + Fira Code |
| `frontend/src/styles.scss` | Modify — base `font-family`, Material typography config, new `.tabular-nums` utility |
| `frontend/src/app/bot-logs/bot-logs-page.component.scss` | Modify — add zebra striping to `.log-row` |
| `frontend/src/app/bot-config/bot-config.component.html` | Modify — wrap each tab's 3 sections in `mat-card` (both MX and USA tabs) |
| `frontend/src/app/bot-config/bot-config.component.scss` | Modify — add `.config-card` styling, remove now-unused `.field-block.full-width`/`.config-grid` top-level spacing since cards own their own padding |
| `frontend/src/app/trade-log/trade-log.component.ts` | Modify — add `tradeCountLabel` getter, `isMobile` via `BreakpointObserver` |
| `frontend/src/app/trade-log/trade-log.component.html` | Modify — add footer, mobile card view, unwrap desktop table behind `*ngIf="!isMobile"` |
| `frontend/src/app/trade-log/trade-log.component.scss` | Modify — footer styling, mobile card styling, reason text wraps instead of truncating |
| `frontend/src/app/trade-log/trade-log.component.spec.ts` | Create — tests for `tradeCountLabel` |
| `frontend/src/app/agent-log/agent-log.component.ts` | Modify — replace expand/collapse state with `selectedLogId`/`selectedLog`/`isMobile`/`mobileDetailMode`, remove `toggleExpand`/`isExpanded` |
| `frontend/src/app/agent-log/agent-log.component.html` | Rewrite — master-detail markup |
| `frontend/src/app/agent-log/agent-log.component.scss` | Rewrite — split-pane layout + mobile full-screen detail styling |
| `frontend/src/app/agent-log/agent-log.component.spec.ts` | Create — tests for selection/fallback logic |

---

### Task 1: Global Typography

**Files:**
- Modify: `frontend/src/index.html`
- Modify: `frontend/src/styles.scss`

**Interfaces:**
- Produces: `.tabular-nums` CSS utility class, used by Task 3 (Trade Log) and Task 5 (Agent Log) for numeric values.

- [ ] **Step 1: Swap the Google Fonts link**

In `frontend/src/index.html`, find:
```html
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
```
Replace with:
```html
<link href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
```
(The `Material+Icons` link below it is untouched.)

- [ ] **Step 2: Update the Material typography config and base font**

In `frontend/src/styles.scss`, find:
```scss
$app-theme:   mat.define-dark-theme((
  color: (primary: $app-primary, accent: $app-accent),
  typography: mat.define-typography-config(),
  density: 0,
));
```
Replace with:
```scss
$app-theme:   mat.define-dark-theme((
  color: (primary: $app-primary, accent: $app-accent),
  typography: mat.define-typography-config(
    $font-family: "'Fira Sans', 'Helvetica Neue', sans-serif",
  ),
  density: 0,
));
```
This is required because Angular Material components (buttons, form fields, tabs, chips) read their font from this typography config, not from the plain `body { font-family }` rule below — changing only `body` would leave every `mat-*` component still rendering in Roboto.

Then find:
```scss
body {
  margin: 0;
  font-family: Roboto, "Helvetica Neue", sans-serif;
  background: var(--bg-base);
  color: var(--text-primary);
}
```
Replace with:
```scss
body {
  margin: 0;
  font-family: 'Fira Sans', "Helvetica Neue", sans-serif;
  background: var(--bg-base);
  color: var(--text-primary);
}
```

- [ ] **Step 3: Add the tabular-nums utility**

In `frontend/src/styles.scss`, after the `body { ... }` block, add:
```scss
// For numeric/tabular data (prices, quantities, timestamps in tables) —
// Fira Code's tabular figures keep columns aligned as values update,
// instead of digits shifting width under the default proportional font.
.tabular-nums {
  font-family: 'Fira Code', monospace;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Build and visually verify**

```bash
cd frontend && npx ng build 2>&1 | tail -10
```
Expected: `Application bundle generation complete.` with no new errors.

Then run the dev server (if not already running) and screenshot any page (e.g. Dashboard) to confirm text now renders in Fira Sans, not Roboto — the change is visible in body copy weight/shape immediately.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.html frontend/src/styles.scss
git commit -m "style: switch typography to Fira Sans + Fira Code for a data-dense dashboard feel"
```

---

### Task 2: Bot Logs — Zebra Striping

**Files:**
- Modify: `frontend/src/app/bot-logs/bot-logs-page.component.scss`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add alternating row background**

In `frontend/src/app/bot-logs/bot-logs-page.component.scss`, find:
```scss
.log-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  flex-wrap: wrap;

  &:hover {
    background: var(--bg-surface);
  }
}
```
Replace with:
```scss
.log-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  flex-wrap: wrap;

  &:nth-child(even) {
    background: rgba(255, 255, 255, 0.02);
  }

  &:hover {
    background: var(--bg-surface);
  }
}
```
(`:hover` stays last so it wins over the zebra background on the row currently under the pointer.)

- [ ] **Step 2: Build and visually verify**

```bash
cd frontend && npx ng build 2>&1 | tail -10
```
Then screenshot the Bot Logs page (`/bot-logs`) with the dev server running and confirm alternating rows are subtly visible without hurting readability.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/bot-logs/bot-logs-page.component.scss
git commit -m "style: add zebra striping to Bot Logs rows for easier scanning"
```

---

### Task 3: Bot Config — Sectioned Cards

**Files:**
- Modify: `frontend/src/app/bot-config/bot-config.component.html`
- Modify: `frontend/src/app/bot-config/bot-config.component.scss`

**Interfaces:**
- Consumes: nothing new — same `mxConfig`/`usaConfig`/`mxSymbols`/`usaSymbols`/`saving` fields and `onSymbolChange`/`saveConfig` methods already on `BotConfigComponent`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Replace the MX tab's flat `.config-section` with three cards**

In `frontend/src/app/bot-config/bot-config.component.html`, find the MX tab block:
```html
  <mat-tab label="MX — BMV">
    <div class="config-section">
      <div class="field-block full-width">
        <h3>Symbols (BMV IPC)</h3>
        <mat-chip-listbox
          multiple
          [value]="mxConfig.symbols"
          (change)="onSymbolChange($event, 'MX')">
          <mat-chip-option *ngFor="let s of mxSymbols" [value]="s">{{ s }}</mat-chip-option>
        </mat-chip-listbox>
      </div>

      <div class="config-grid">
        <div class="field-block">
          <h3>Capital Limit per Cycle (MXN)</h3>
          <p class="field-hint">Maximum cash the bot is allowed to use across all symbols in a single cycle. The 20% rule is applied per symbol on top of this limit — so with $10,000 MXN and 5 symbols, Claude can invest up to $2,000 MXN per symbol per cycle.</p>
          <mat-form-field appearance="outline">
            <mat-label>Capital Limit (MXN)</mat-label>
            <input matInput type="number" [(ngModel)]="mxConfig.capitalLimit" min="1000">
          </mat-form-field>
        </div>

        <div class="field-block">
          <h3>Check Frequency</h3>
          <p class="field-hint">How often the bot re-evaluates this market and may act, in minutes.</p>
          <mat-form-field appearance="outline">
            <mat-label>Interval (minutes)</mat-label>
            <input matInput type="number" [(ngModel)]="mxConfig.intervalMin" min="1" max="1440">
          </mat-form-field>
        </div>

        <div class="field-block">
          <h3>Confidence Threshold</h3>
          <p class="field-hint">Claude must reach this confidence level (0.00–1.00) to execute a trade. Lower = more trades, higher = more selective.</p>
          <mat-form-field appearance="outline">
            <mat-label>Confidence Threshold</mat-label>
            <input matInput type="number" [(ngModel)]="mxConfig.confidenceThreshold" min="0.50" max="0.95" step="0.05">
            <mat-hint>Current: {{ mxConfig.confidenceThreshold | number:'1.2-2' }} — recommended 0.65–0.75</mat-hint>
          </mat-form-field>
        </div>
      </div>

      <div class="footer-row">
        <mat-slide-toggle [(ngModel)]="mxConfig.isActive" color="primary">
          {{ mxConfig.isActive ? 'Active' : 'Inactive' }}
        </mat-slide-toggle>

        <button mat-raised-button color="primary" (click)="saveConfig('MX')" [disabled]="saving">
          Save MX Configuration
        </button>
      </div>
    </div>
  </mat-tab>
```
Replace with:
```html
  <mat-tab label="MX — BMV">
    <div class="config-section">
      <mat-card class="config-card">
        <h3>Symbols (BMV IPC)</h3>
        <mat-chip-listbox
          multiple
          [value]="mxConfig.symbols"
          (change)="onSymbolChange($event, 'MX')">
          <mat-chip-option *ngFor="let s of mxSymbols" [value]="s">{{ s }}</mat-chip-option>
        </mat-chip-listbox>
      </mat-card>

      <mat-card class="config-card">
        <h3>Trading Parameters</h3>
        <div class="config-grid">
          <div class="field-block">
            <h4>Capital Limit per Cycle (MXN)</h4>
            <p class="field-hint">Maximum cash the bot is allowed to use across all symbols in a single cycle. The 20% rule is applied per symbol on top of this limit — so with $10,000 MXN and 5 symbols, Claude can invest up to $2,000 MXN per symbol per cycle.</p>
            <mat-form-field appearance="outline">
              <mat-label>Capital Limit (MXN)</mat-label>
              <input matInput type="number" [(ngModel)]="mxConfig.capitalLimit" min="1000">
            </mat-form-field>
          </div>

          <div class="field-block">
            <h4>Check Frequency</h4>
            <p class="field-hint">How often the bot re-evaluates this market and may act, in minutes.</p>
            <mat-form-field appearance="outline">
              <mat-label>Interval (minutes)</mat-label>
              <input matInput type="number" [(ngModel)]="mxConfig.intervalMin" min="1" max="1440">
            </mat-form-field>
          </div>

          <div class="field-block">
            <h4>Confidence Threshold</h4>
            <p class="field-hint">Claude must reach this confidence level (0.00–1.00) to execute a trade. Lower = more trades, higher = more selective.</p>
            <mat-form-field appearance="outline">
              <mat-label>Confidence Threshold</mat-label>
              <input matInput type="number" [(ngModel)]="mxConfig.confidenceThreshold" min="0.50" max="0.95" step="0.05">
              <mat-hint>Current: {{ mxConfig.confidenceThreshold | number:'1.2-2' }} — recommended 0.65–0.75</mat-hint>
            </mat-form-field>
          </div>
        </div>
      </mat-card>

      <mat-card class="config-card status-card">
        <mat-slide-toggle [(ngModel)]="mxConfig.isActive" color="primary">
          {{ mxConfig.isActive ? 'Active' : 'Inactive' }}
        </mat-slide-toggle>

        <button mat-raised-button color="primary" (click)="saveConfig('MX')" [disabled]="saving">
          Save MX Configuration
        </button>
      </mat-card>
    </div>
  </mat-tab>
```

- [ ] **Step 2: Apply the identical restructure to the USA tab**

Same file, find the USA tab block:
```html
  <mat-tab label="USA — NYSE/Nasdaq">
    <div class="config-section">
      <div class="field-block full-width">
        <h3>Symbols (NYSE/Nasdaq)</h3>
        <mat-chip-listbox
          multiple
          [value]="usaConfig.symbols"
          (change)="onSymbolChange($event, 'USA')">
          <mat-chip-option *ngFor="let s of usaSymbols" [value]="s">{{ s }}</mat-chip-option>
        </mat-chip-listbox>
      </div>

      <div class="config-grid">
        <div class="field-block">
          <h3>Capital Limit per Cycle (USD)</h3>
          <p class="field-hint">Maximum cash the bot is allowed to use across all symbols in a single cycle. The 20% rule is applied per symbol on top of this limit — so with $1,000 USD and 5 symbols, Claude can invest up to $200 USD per symbol per cycle.</p>
          <mat-form-field appearance="outline">
            <mat-label>Capital Limit (USD)</mat-label>
            <input matInput type="number" [(ngModel)]="usaConfig.capitalLimit" min="100">
          </mat-form-field>
        </div>

        <div class="field-block">
          <h3>Check Frequency</h3>
          <p class="field-hint">How often the bot re-evaluates this market and may act, in minutes.</p>
          <mat-form-field appearance="outline">
            <mat-label>Interval (minutes)</mat-label>
            <input matInput type="number" [(ngModel)]="usaConfig.intervalMin" min="1" max="1440">
          </mat-form-field>
        </div>

        <div class="field-block">
          <h3>Confidence Threshold</h3>
          <p class="field-hint">Claude must reach this confidence level (0.00–1.00) to execute a trade. Lower = more trades, higher = more selective.</p>
          <mat-form-field appearance="outline">
            <mat-label>Confidence Threshold</mat-label>
            <input matInput type="number" [(ngModel)]="usaConfig.confidenceThreshold" min="0.50" max="0.95" step="0.05">
            <mat-hint>Current: {{ usaConfig.confidenceThreshold | number:'1.2-2' }} — recommended 0.65–0.75</mat-hint>
          </mat-form-field>
        </div>
      </div>

      <div class="footer-row">
        <mat-slide-toggle [(ngModel)]="usaConfig.isActive" color="primary">
          {{ usaConfig.isActive ? 'Active' : 'Inactive' }}
        </mat-slide-toggle>

        <button mat-raised-button color="primary" (click)="saveConfig('USA')" [disabled]="saving">
          Save USA Configuration
        </button>
      </div>
    </div>
  </mat-tab>
```
Replace with:
```html
  <mat-tab label="USA — NYSE/Nasdaq">
    <div class="config-section">
      <mat-card class="config-card">
        <h3>Symbols (NYSE/Nasdaq)</h3>
        <mat-chip-listbox
          multiple
          [value]="usaConfig.symbols"
          (change)="onSymbolChange($event, 'USA')">
          <mat-chip-option *ngFor="let s of usaSymbols" [value]="s">{{ s }}</mat-chip-option>
        </mat-chip-listbox>
      </mat-card>

      <mat-card class="config-card">
        <h3>Trading Parameters</h3>
        <div class="config-grid">
          <div class="field-block">
            <h4>Capital Limit per Cycle (USD)</h4>
            <p class="field-hint">Maximum cash the bot is allowed to use across all symbols in a single cycle. The 20% rule is applied per symbol on top of this limit — so with $1,000 USD and 5 symbols, Claude can invest up to $200 USD per symbol per cycle.</p>
            <mat-form-field appearance="outline">
              <mat-label>Capital Limit (USD)</mat-label>
              <input matInput type="number" [(ngModel)]="usaConfig.capitalLimit" min="100">
            </mat-form-field>
          </div>

          <div class="field-block">
            <h4>Check Frequency</h4>
            <p class="field-hint">How often the bot re-evaluates this market and may act, in minutes.</p>
            <mat-form-field appearance="outline">
              <mat-label>Interval (minutes)</mat-label>
              <input matInput type="number" [(ngModel)]="usaConfig.intervalMin" min="1" max="1440">
            </mat-form-field>
          </div>

          <div class="field-block">
            <h4>Confidence Threshold</h4>
            <p class="field-hint">Claude must reach this confidence level (0.00–1.00) to execute a trade. Lower = more trades, higher = more selective.</p>
            <mat-form-field appearance="outline">
              <mat-label>Confidence Threshold</mat-label>
              <input matInput type="number" [(ngModel)]="usaConfig.confidenceThreshold" min="0.50" max="0.95" step="0.05">
              <mat-hint>Current: {{ usaConfig.confidenceThreshold | number:'1.2-2' }} — recommended 0.65–0.75</mat-hint>
            </mat-form-field>
          </div>
        </div>
      </mat-card>

      <mat-card class="config-card status-card">
        <mat-slide-toggle [(ngModel)]="usaConfig.isActive" color="primary">
          {{ usaConfig.isActive ? 'Active' : 'Inactive' }}
        </mat-slide-toggle>

        <button mat-raised-button color="primary" (click)="saveConfig('USA')" [disabled]="saving">
          Save USA Configuration
        </button>
      </mat-card>
    </div>
  </mat-tab>
```

- [ ] **Step 3: Update the SCSS for the new card structure**

In `frontend/src/app/bot-config/bot-config.component.scss`, find:
```scss
.config-section {
  padding: 24px 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 1100px;
}

// 3 columns on wide screens, collapsing down as space runs out, single
// column on mobile — replaces the old fixed 560px column that left most
// of a normal-width screen empty.
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
  align-items: start;
}

.field-block.full-width {
  grid-column: 1 / -1;
}

.footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
```
Replace with:
```scss
.config-section {
  padding: 24px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1100px;
}

.config-card {
  padding: 16px;

  h3 {
    margin-top: 0;
  }
}

// 3 columns on wide screens, collapsing down as space runs out, single
// column on mobile — replaces the old fixed 560px column that left most
// of a normal-width screen empty.
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
  align-items: start;
}

.status-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
```
(`.field-block.full-width` and `.footer-row` are removed — the Symbols block no longer needs the grid-spanning rule since it's now its own card, and the toggle+save row's layout is now handled by `.status-card` directly instead of a nested `.footer-row`.)

- [ ] **Step 4: Add the mobile stacking rule for the status card**

In the same file, inside the existing `@media (max-width: 768px) { ... }` block, find:
```scss
  .footer-row {
    flex-direction: column;
    align-items: stretch;

    button {
      width: 100%;
    }
  }
```
Replace with:
```scss
  .status-card {
    flex-direction: column;
    align-items: stretch;

    button {
      width: 100%;
    }
  }
```

- [ ] **Step 5: Build and visually verify at desktop and mobile widths**

```bash
cd frontend && npx ng build 2>&1 | tail -10
```
With the dev server running, screenshot `/bot-config` at 1440px and 390px widths (both MX and USA tabs) and confirm: three visually distinct bordered cards, no leftover dead space between the toggle and save button, mobile stacks all three cards full-width with the status card's toggle/button stacked vertically.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/bot-config/bot-config.component.html frontend/src/app/bot-config/bot-config.component.scss
git commit -m "style: restructure Bot Config into three sectioned cards"
```

---

### Task 4: Trade Log — Content-Sized Table, Empty/Sparse State, Mobile Cards

**Files:**
- Modify: `frontend/src/app/trade-log/trade-log.component.ts`
- Modify: `frontend/src/app/trade-log/trade-log.component.html`
- Modify: `frontend/src/app/trade-log/trade-log.component.scss`
- Test: `frontend/src/app/trade-log/trade-log.component.spec.ts`

**Interfaces:**
- Produces: `tradeCountLabel: string` getter, `isMobile: boolean` field on `TradeLogComponent` — not consumed by other components.

- [ ] **Step 1: Write the failing test for `tradeCountLabel`**

Create `frontend/src/app/trade-log/trade-log.component.spec.ts`:
```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TradeLogComponent } from './trade-log.component';
import { TradeService } from '../core/services/trade.service';
import { Trade } from '../core/models/trade.model';

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: '1',
    createdAt: '2026-07-02T10:00:00.000Z',
    symbol: 'AMXL',
    market: 'MX',
    action: 'buy',
    quantity: 10,
    price: 22.5,
    currency: 'MXN',
    reason: 'test',
    ...overrides,
  };
}

describe('TradeLogComponent', () => {
  let component: TradeLogComponent;
  let fixture: ComponentFixture<TradeLogComponent>;
  let tradeServiceStub: { getTrades: jasmine.Spy };

  beforeEach(async () => {
    tradeServiceStub = { getTrades: jasmine.createSpy('getTrades').and.returnValue(of([])) };

    await TestBed.configureTestingModule({
      imports: [TradeLogComponent],
      providers: [{ provide: TradeService, useValue: tradeServiceStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(TradeLogComponent);
    component = fixture.componentInstance;
  });

  it('shows a zero-state message when there are no trades', () => {
    component.trades = [];
    expect(component.tradeCountLabel).toBe('No trades yet');
  });

  it('uses singular phrasing for exactly one trade', () => {
    component.trades = [makeTrade()];
    expect(component.tradeCountLabel).toBe("That's everything so far — 1 trade executed");
  });

  it('uses plural phrasing for more than one trade', () => {
    component.trades = [makeTrade({ id: '1' }), makeTrade({ id: '2' })];
    expect(component.tradeCountLabel).toBe("That's everything so far — 2 trades executed");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/trade-log.component.spec.ts' 2>&1 | tail -30
```
Expected: FAIL — `tradeCountLabel` does not exist on `TradeLogComponent` (compile error) or the tests report the getter as `undefined`.

- [ ] **Step 3: Add `tradeCountLabel` and `isMobile` to the component**

In `frontend/src/app/trade-log/trade-log.component.ts`, add the import:
```typescript
import { BreakpointObserver } from '@angular/cdk/layout';
import { OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
```
(merge `OnDestroy` into the existing `import { Component, OnInit } from '@angular/core';` line so it reads `import { Component, OnInit, OnDestroy } from '@angular/core';`, and add the two new import lines above it.)

Change the class declaration and add the constructor/lifecycle wiring — find:
```typescript
export class TradeLogComponent implements OnInit {
  trades: Trade[] = [];
  loading = false;
  displayedColumns = ['createdAt', 'symbol', 'market', 'action', 'quantity', 'price', 'currency', 'reason'];

  marketFilter: 'MX' | 'USA' | '' = '';
  symbolFilter = '';

  constructor(private tradeService: TradeService) {}

  ngOnInit(): void {
    this.loadTrades();
  }
```
Replace with:
```typescript
export class TradeLogComponent implements OnInit, OnDestroy {
  trades: Trade[] = [];
  loading = false;
  isMobile = false;
  displayedColumns = ['createdAt', 'symbol', 'market', 'action', 'quantity', 'price', 'currency', 'reason'];

  marketFilter: 'MX' | 'USA' | '' = '';
  symbolFilter = '';

  private breakpointSub: Subscription | null = null;

  constructor(
    private tradeService: TradeService,
    private breakpointObserver: BreakpointObserver,
  ) {}

  get tradeCountLabel(): string {
    const n = this.trades.length;
    if (n === 0) return 'No trades yet';
    return `That's everything so far — ${n} trade${n === 1 ? '' : 's'} executed`;
  }

  ngOnInit(): void {
    this.loadTrades();
    this.breakpointSub = this.breakpointObserver.observe('(max-width: 768px)').subscribe(result => {
      this.isMobile = result.matches;
    });
  }

  ngOnDestroy(): void {
    this.breakpointSub?.unsubscribe();
  }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/trade-log.component.spec.ts' 2>&1 | tail -30
```
Expected: `TOTAL: 3 SUCCESS` (or similar, all 3 new tests passing).

- [ ] **Step 5: Update the template — footer, mobile cards, desktop table gated by `isMobile`**

In `frontend/src/app/trade-log/trade-log.component.html`, replace the entire file with:
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

<div class="table-scroll" *ngIf="!isMobile">
<table mat-table [dataSource]="trades" class="full-width">
  <ng-container matColumnDef="createdAt">
    <th mat-header-cell *matHeaderCellDef>Date</th>
    <td mat-cell *matCellDef="let row" class="tabular-nums">{{ row.createdAt | date:'short' }}</td>
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
    <td mat-cell *matCellDef="let row" class="tabular-nums">{{ row.quantity }}</td>
  </ng-container>
  <ng-container matColumnDef="price">
    <th mat-header-cell *matHeaderCellDef>Price</th>
    <td mat-cell *matCellDef="let row" class="tabular-nums">{{ row.price | number:'1.2-2' }}</td>
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
</table>
</div>

<div class="trade-cards" *ngIf="isMobile">
  <div class="trade-card" *ngFor="let row of trades">
    <div class="trade-card-header">
      <strong>{{ row.symbol }}</strong>
      <span [class]="getActionClass(row.action)" class="action-chip">{{ row.action | uppercase }}</span>
    </div>
    <div class="trade-card-row"><span class="label">Date</span><span class="value tabular-nums">{{ row.createdAt | date:'short' }}</span></div>
    <div class="trade-card-row"><span class="label">Market</span><span class="value">{{ row.market }}</span></div>
    <div class="trade-card-row"><span class="label">Qty</span><span class="value tabular-nums">{{ row.quantity }}</span></div>
    <div class="trade-card-row"><span class="label">Price</span><span class="value tabular-nums">{{ row.price | number:'1.2-2' }} {{ row.currency }}</span></div>
    <div class="trade-card-row reason-row"><span class="label">Reason</span><span class="value reason-text">{{ row.reason }}</span></div>
  </div>
</div>

<div class="trades-footer">
  {{ tradeCountLabel }}
  <div class="trades-footer-sub" *ngIf="trades.length > 0">New trades will appear here automatically as the bot executes them.</div>
</div>
```
(The `*matNoDataRow` block is removed since the new `.trades-footer` below the table now covers the zero-trades case for both desktop and mobile.)

- [ ] **Step 6: Update the SCSS — footer, mobile cards, wrap instead of truncate**

Replace `frontend/src/app/trade-log/trade-log.component.scss` entirely with:
```scss
.filters-row {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.table-scroll {
  overflow-x: auto;
  width: 100%;
}

.full-width { width: 100%; }

.action-chip {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.action-buy  { background: rgba(16, 185, 129, 0.15);  color: var(--green); }
.action-sell { background: rgba(239, 68, 68, 0.15);   color: var(--red); }
.action-hold { background: rgba(156, 163, 175, 0.15); color: var(--text-muted); }

.reason-cell {
  max-width: 320px;
  white-space: normal;
  word-break: break-word;
  color: var(--text-muted);
}

.trade-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trade-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
}

.trade-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
}

.trade-card-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 3px 0;
  font-size: 13px;

  .label {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .value {
    text-align: right;
    color: var(--text-primary);
  }
}

.reason-row {
  align-items: flex-start;
  flex-direction: column;
  gap: 2px;

  .value {
    text-align: left;
  }
}

.trades-footer {
  text-align: center;
  padding: 20px;
  margin-top: 16px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 13px;
}

.trades-footer-sub {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.7;
}
```
(`.no-data` is removed — it styled the now-deleted `*matNoDataRow`.)

- [ ] **Step 7: Build and visually verify at desktop and mobile widths**

```bash
cd frontend && npx ng build 2>&1 | tail -10
```
With the dev server running, screenshot `/trade-log` at 1440px (table + footer, no dead space) and 390px (stacked cards + footer, reason text wraps in full rather than truncating).

- [ ] **Step 8: Run the full frontend test suite to confirm no regressions**

```bash
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless 2>&1 | tail -10
```
Expected: same pass/fail counts as before this task, plus the 3 new Trade Log tests passing.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/trade-log/
git commit -m "feat: size Trade Log to its content, add empty/sparse footer, mobile card view"
```

---

### Task 5: Agent Logs — Master-Detail Split View

**Files:**
- Modify: `frontend/src/app/agent-log/agent-log.component.ts`
- Modify: `frontend/src/app/agent-log/agent-log.component.html`
- Modify: `frontend/src/app/agent-log/agent-log.component.scss`
- Test: `frontend/src/app/agent-log/agent-log.component.spec.ts`

**Interfaces:**
- Consumes: `AgentLog` from `../core/models/agent-log.model` (unchanged), `AgentLogService.getLogs()` (unchanged).
- Produces: `selectedLog: AgentLog | null` getter, `selectLog(id: string): void`, `closeMobileDetail(): void`, `isMobile: boolean`, `mobileDetailMode: boolean` — not consumed by other components (this component has no children reading its state).

- [ ] **Step 1: Write the failing tests for selection/fallback logic**

Create `frontend/src/app/agent-log/agent-log.component.spec.ts`:
```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { AgentLogComponent } from './agent-log.component';
import { AgentLogService } from '../core/services/agent-log.service';
import { AgentLog } from '../core/models/agent-log.model';

function makeLog(id: string, overrides: Partial<AgentLog> = {}): AgentLog {
  return {
    id,
    createdAt: '2026-07-02T10:00:00.000Z',
    symbol: 'AMXL',
    market: 'MX',
    executed: false,
    marketData: { lastPrice: 22.5, changePct: 0.5, volume: 1000, indicators: { rsi14: 50, ma20: 22, ma50: 21, percentChange5d: 1, volumeRatio: 1 } },
    response: { action: 'hold', quantity: 0, confidence: 0.5, reason: 'test' },
    ...overrides,
  };
}

describe('AgentLogComponent', () => {
  let component: AgentLogComponent;
  let fixture: ComponentFixture<AgentLogComponent>;
  let agentLogServiceStub: { getLogs: jasmine.Spy };

  beforeEach(async () => {
    agentLogServiceStub = { getLogs: jasmine.createSpy('getLogs').and.returnValue(of({ logs: [] })) };

    await TestBed.configureTestingModule({
      imports: [AgentLogComponent],
      providers: [
        { provide: AgentLogService, useValue: agentLogServiceStub },
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: false }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentLogComponent);
    component = fixture.componentInstance;
  });

  it('returns null when there are no logs', () => {
    component.logs = [];
    expect(component.selectedLog).toBeNull();
  });

  it('defaults to the first log when nothing is explicitly selected', () => {
    component.logs = [makeLog('a'), makeLog('b')];
    expect(component.selectedLog?.id).toBe('a');
  });

  it('returns the explicitly selected log when it exists in the filtered list', () => {
    component.logs = [makeLog('a'), makeLog('b')];
    component.selectLog('b');
    expect(component.selectedLog?.id).toBe('b');
  });

  it('falls back to the first visible log when the selected one is filtered out', () => {
    component.logs = [
      makeLog('a', { response: { action: 'hold', quantity: 0, confidence: 0.5, reason: 'x' } }),
      makeLog('b', { response: { action: 'buy', quantity: 5, confidence: 0.8, reason: 'y' } }),
    ];
    component.selectLog('a');
    component.setActionFilter('buy');
    expect(component.selectedLog?.id).toBe('b');
  });

  it('opens mobile detail mode on selection when isMobile is true', () => {
    component.isMobile = true;
    component.logs = [makeLog('a')];
    component.selectLog('a');
    expect(component.mobileDetailMode).toBeTrue();
  });

  it('does not open mobile detail mode on selection when isMobile is false', () => {
    component.isMobile = false;
    component.logs = [makeLog('a')];
    component.selectLog('a');
    expect(component.mobileDetailMode).toBeFalse();
  });

  it('closeMobileDetail turns mobileDetailMode off', () => {
    component.isMobile = true;
    component.logs = [makeLog('a')];
    component.selectLog('a');
    component.closeMobileDetail();
    expect(component.mobileDetailMode).toBeFalse();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/agent-log.component.spec.ts' 2>&1 | tail -40
```
Expected: FAIL — `selectedLog`, `selectLog`, `mobileDetailMode`, `closeMobileDetail`, `isMobile` do not exist on `AgentLogComponent` yet.

- [ ] **Step 3: Implement the selection/fallback logic and remove the old expand/collapse state**

Replace `frontend/src/app/agent-log/agent-log.component.ts` entirely with:
```typescript
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Subscription, interval } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';
import { AgentLogService } from '../core/services/agent-log.service';
import { AgentLog } from '../core/models/agent-log.model';

@Component({
  selector: 'app-agent-log',
  standalone: true,
  imports: [CommonModule, MatChipsModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './agent-log.component.html',
  styleUrls: ['./agent-log.component.scss'],
})
export class AgentLogComponent implements OnInit, OnChanges, OnDestroy {
  @Input() market: 'MX' | 'USA' = 'MX';
  @Input() isRunning = false;

  logs: AgentLog[] = [];
  loading = false;
  actionFilter: 'all' | 'buy' | 'sell' | 'hold' = 'all';
  isMobile = false;
  mobileDetailMode = false;
  private selectedLogId: string | null = null;

  get filteredLogs(): AgentLog[] {
    if (this.actionFilter === 'all') return this.logs;
    return this.logs.filter(l => l.response.action === this.actionFilter);
  }

  get selectedLog(): AgentLog | null {
    const list = this.filteredLogs;
    return list.find(l => l.id === this.selectedLogId) ?? list[0] ?? null;
  }

  selectLog(id: string): void {
    this.selectedLogId = id;
    if (this.isMobile) this.mobileDetailMode = true;
  }

  closeMobileDetail(): void {
    this.mobileDetailMode = false;
  }

  setActionFilter(f: 'all' | 'buy' | 'sell' | 'hold'): void {
    this.actionFilter = f;
  }

  inputFieldLabels: Record<string, string> = {
    lastPrice: 'Last Price',
    changePct: 'Day Change %',
    volume: 'Volume',
    rsi14: 'RSI (14)',
    ma20: 'MA20',
    ma50: 'MA50',
    percentChange5d: '5d Change %',
    volumeRatio: 'Volume Ratio',
  };

  readonly inputKeys = Object.keys(this.inputFieldLabels);

  private pollSub: Subscription | null = null;
  private breakpointSub: Subscription | null = null;

  constructor(
    private agentLogService: AgentLogService,
    private breakpointObserver: BreakpointObserver,
  ) {}

  ngOnInit(): void {
    this.startPolling();
    this.breakpointSub = this.breakpointObserver.observe('(max-width: 768px)').subscribe(result => {
      this.isMobile = result.matches;
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['market']?.firstChange || changes['isRunning']?.firstChange) return;
    if (changes['market'] || changes['isRunning']) {
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.breakpointSub?.unsubscribe();
  }

  private startPolling(): void {
    this.pollSub?.unsubscribe();
    this.loading = true;

    if (this.isRunning) {
      this.pollSub = interval(30_000).pipe(
        startWith(0),
        switchMap(() => this.agentLogService.getLogs(this.market))
      ).subscribe({
        next: ({ logs }) => { this.logs = logs; this.loading = false; },
        error: () => { this.loading = false; },
      });
    } else {
      this.pollSub = this.agentLogService.getLogs(this.market).subscribe({
        next: ({ logs }) => { this.logs = logs; this.loading = false; },
        error: () => { this.loading = false; },
      });
    }
  }

  getFieldValue(log: AgentLog, key: string): string {
    const md = log.marketData;
    const ind = md?.indicators;
    const map: Record<string, string> = {
      lastPrice: md?.lastPrice != null ? md.lastPrice.toFixed(2) : '—',
      changePct: md?.changePct != null ? `${md.changePct >= 0 ? '+' : ''}${md.changePct.toFixed(2)}%` : '—',
      volume: md?.volume != null ? md.volume.toLocaleString() : '—',
      rsi14: ind?.rsi14 != null ? ind.rsi14.toFixed(2) : '—',
      ma20: ind?.ma20 != null ? ind.ma20.toFixed(2) : '—',
      ma50: ind?.ma50 != null ? ind.ma50.toFixed(2) : '—',
      percentChange5d: ind?.percentChange5d != null ? `${ind.percentChange5d >= 0 ? '+' : ''}${ind.percentChange5d.toFixed(2)}%` : '—',
      volumeRatio: ind?.volumeRatio != null ? `${ind.volumeRatio.toFixed(2)}x` : '—',
    };
    return map[key] ?? '—';
  }

  getActionClass(action: string): string {
    return `action-${action}`;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/agent-log.component.spec.ts' 2>&1 | tail -40
```
Expected: `TOTAL: 7 SUCCESS`.

- [ ] **Step 5: Rewrite the template as a master-detail layout**

Replace `frontend/src/app/agent-log/agent-log.component.html` entirely with:
```html
<div class="agent-log-container">

  <div class="toggle-panel">
    <div class="toggle-row">
      <span class="toggle-label">Action:</span>
      <mat-chip-set>
        <mat-chip [class.active]="actionFilter === 'all'"  (click)="setActionFilter('all')">All</mat-chip>
        <mat-chip [class.active]="actionFilter === 'buy'"  (click)="setActionFilter('buy')"  class="filter-buy">Buy</mat-chip>
        <mat-chip [class.active]="actionFilter === 'sell'" (click)="setActionFilter('sell')" class="filter-sell">Sell</mat-chip>
        <mat-chip [class.active]="actionFilter === 'hold'" (click)="setActionFilter('hold')">Hold</mat-chip>
      </mat-chip-set>
    </div>
  </div>

  <div *ngIf="loading" class="loading-container">
    <mat-progress-spinner mode="indeterminate" diameter="36"></mat-progress-spinner>
  </div>

  <div *ngIf="!loading && filteredLogs.length === 0" class="empty-state">
    <mat-icon>smart_toy</mat-icon>
    <p>No agent cycles recorded yet. Start the bot to see Claude's decisions here.</p>
  </div>

  <div *ngIf="!loading && filteredLogs.length > 0" class="master-detail">

    <div class="log-list" *ngIf="!isMobile || !mobileDetailMode">
      <div *ngFor="let log of filteredLogs"
           class="log-row-compact"
           [class.selected]="selectedLog?.id === log.id"
           (click)="selectLog(log.id)">
        <span class="symbol-chip">{{ log.symbol }}</span>
        <span class="market-badge">{{ log.market }}</span>
        <span class="timestamp tabular-nums">{{ log.createdAt | date:'MMM d, h:mm:ss a' }}</span>
        <span [class]="getActionClass(log.response.action)" class="action-badge">{{ log.response.action | uppercase }}</span>
        <span *ngIf="log.executed" class="executed-badge">EXECUTED</span>
      </div>
    </div>

    <div class="log-detail" *ngIf="(!isMobile || mobileDetailMode) && selectedLog as log">
      <button mat-button class="detail-back" *ngIf="isMobile && mobileDetailMode" (click)="closeMobileDetail()">
        <mat-icon>arrow_back</mat-icon>
        <span>Back</span>
      </button>

      <div class="detail-title">
        <span class="symbol-chip">{{ log.symbol }}</span>
        <span class="market-badge">{{ log.market }}</span>
        <span [class]="getActionClass(log.response.action)" class="action-badge">{{ log.response.action | uppercase }}</span>
        <span *ngIf="log.executed" class="executed-badge">EXECUTED</span>
      </div>
      <div class="detail-timestamp tabular-nums">{{ log.createdAt | date:'MMM d, h:mm:ss a' }}</div>

      <div class="log-body">
        <div class="input-bubble">
          <div class="bubble-header">Input</div>
          <div *ngFor="let key of inputKeys" class="field-row">
            <span class="field-label">{{ inputFieldLabels[key] }}</span>
            <span class="field-value tabular-nums">{{ getFieldValue(log, key) }}</span>
          </div>
        </div>

        <div class="claude-bubble">
          <div class="bubble-header">Claude</div>
          <div class="field-row">
            <span class="field-label">Quantity</span>
            <span class="field-value tabular-nums">{{ log.response.quantity }}</span>
          </div>
          <div class="field-row">
            <span class="field-label">Confidence</span>
            <span class="field-value tabular-nums">{{ log.response.confidence | number:'1.2-2' }}</span>
          </div>
          <div class="field-row reason-row">
            <span class="field-label">Reason</span>
            <span class="field-value reason-text">{{ log.response.reason }}</span>
          </div>
        </div>
      </div>
    </div>

  </div>

</div>
```

- [ ] **Step 6: Rewrite the SCSS for the split-pane layout**

Replace `frontend/src/app/agent-log/agent-log.component.scss` entirely with:
```scss
.agent-log-container {
  padding: 16px;
}

.toggle-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toggle-label {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 90px;
}

mat-chip {
  cursor: pointer;
  opacity: 0.45;
  font-size: 12px !important;
  transition: opacity 0.15s;

  &.active {
    opacity: 1;
  }

  &.filter-buy.active  { color: var(--green) !important; }
  &.filter-sell.active { color: var(--red)   !important; }
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
  color: var(--text-muted);

  mat-icon {
    font-size: 48px;
    width: 48px;
    height: 48px;
  }

  p {
    margin: 0;
    text-align: center;
    font-size: 14px;
  }
}

.master-detail {
  display: flex;
  gap: 16px;
  align-items: flex-start;

  @media (max-width: 768px) {
    display: block;
  }
}

.log-list {
  flex: 0 0 38%;
  min-width: 280px;
  max-height: 72vh;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-sidebar);

  @media (max-width: 768px) {
    max-height: none;
    width: 100%;
  }
}

.log-row-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  cursor: pointer;
  user-select: none;

  &:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  &.selected {
    background: rgba(245, 158, 11, 0.1);
    border-left: 3px solid var(--accent);
    padding-left: 11px;
  }

  &:last-child {
    border-bottom: none;
  }
}

.log-detail {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.detail-back {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  justify-content: flex-start;
  border-radius: 0;
  border-bottom: 1px solid var(--border);
  color: var(--accent) !important;
  font-size: 13px;
  font-weight: 600;
}

.detail-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 14px 4px;
  flex-wrap: wrap;
}

.detail-timestamp {
  padding: 0 14px 12px;
  font-size: 11px;
  color: var(--text-muted);
}

.symbol-chip {
  font-weight: 700;
  font-size: 13px;
  color: var(--text-primary);
}

.market-badge {
  font-size: 11px;
  background: var(--bg-surface);
  color: var(--text-muted);
  padding: 2px 7px;
  border-radius: 4px;
}

.timestamp {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: auto;
}

.executed-badge {
  font-size: 11px;
  background: rgba(16, 185, 129, 0.15);
  color: var(--green);
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.log-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--border);
  border-top: 1px solid var(--border);

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.input-bubble,
.claude-bubble {
  padding: 12px 14px;
}

.input-bubble {
  background: var(--bg-surface);
}

.claude-bubble {
  background: var(--bg-surface);
  border-left: 3px solid var(--accent);

  @media (max-width: 768px) {
    border-left: none;
    border-top: 3px solid var(--accent);
  }
}

.bubble-header {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
  font-size: 13px;
}

.reason-row {
  align-items: flex-start;
}

.field-label {
  color: var(--text-muted);
  min-width: 90px;
  flex-shrink: 0;
}

.field-value {
  color: var(--text-primary);
  text-align: right;
}

.reason-text {
  text-align: left;
  line-height: 1.4;
}

.action-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;

  &.action-buy {
    background: rgba(16, 185, 129, 0.15);
    color: var(--green);
  }

  &.action-sell {
    background: rgba(239, 68, 68, 0.15);
    color: var(--red);
  }

  &.action-hold {
    background: var(--bg-surface);
    color: var(--text-muted);
  }
}
```

- [ ] **Step 7: Build and visually verify at desktop and mobile widths**

```bash
cd frontend && npx ng build 2>&1 | tail -10
```
With the dev server running:
- Screenshot `/agent-logs` at 1440px: confirm list pane (left, ~38% width) and detail pane (right, filling remaining width — no big empty gap) both visible simultaneously, first log auto-selected, clicking another row updates the detail pane without navigating.
- Screenshot `/agent-logs` at 390px: confirm only the list shows initially (full width, compact rows), tapping a row switches to a full-screen detail view with a "‹ Back" control at the top, tapping Back returns to the list.

- [ ] **Step 8: Run the full frontend test suite to confirm no regressions**

```bash
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless 2>&1 | tail -10
```
Expected: same pass/fail counts as before this task, plus the 7 new Agent Log tests passing.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/agent-log/
git commit -m "feat: replace Agent Logs inline-expand list with a master-detail split view"
```

---

## Final Verification

- [ ] Run the full test suite once more from `frontend/`:
```bash
cd frontend && npx ng build 2>&1 | tail -10 && npx ng test --watch=false --browsers=ChromeHeadless 2>&1 | tail -10
```
Expected: clean build, and only the same pre-existing test failures present before this plan started (confirm by comparing against a `git stash`-free baseline if any doubt — this repo had 3 known pre-existing frontend failures unrelated to any of this work before this plan began).

- [ ] Screenshot all five touched pages (Agent Logs, Bot Config both tabs, Trade Log, Bot Logs, and one unrelated page like Dashboard to confirm the typography change lands globally) at both 1440px and 390px widths as a final visual sweep.
