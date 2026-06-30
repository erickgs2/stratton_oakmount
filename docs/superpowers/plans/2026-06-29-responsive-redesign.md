# Responsive Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Stratton Oakmont Angular frontend fully responsive with a dark navy + gold brand theme, hamburger nav on mobile, and horizontal-scroll tables.

**Architecture:** Option B — replace the Material light theme globally in `styles.scss`, add a `BreakpointObserver` to `app.component.ts` to switch the sidenav between `side` and `over` modes, then update each component's `.scss` file to use CSS custom properties and mobile media queries. No business logic changes.

**Tech Stack:** Angular 17, Angular Material 17 (M2 theming), Angular CDK `BreakpointObserver` (`@angular/cdk/layout` — already installed), SCSS.

## Global Constraints

- Touch **zero** `.ts` files except `app.component.ts` (BreakpointObserver + sidenav toggle only)
- No new npm packages — `@angular/cdk` is already a dependency
- No changes to services, routing, models, or component logic
- Dev server: `cd frontend && npm start` → `http://localhost:4200`
- Breakpoint: `768px` — below this is "mobile"
- Brand palette: `--accent #f59e0b`, `--green #10b981`, `--red #ef4444`, `--bg-sidebar #111827`, `--bg-surface #1f2937`, `--bg-base #0d0d0d`

---

### Task 1: Global Dark Theme

**Files:**
- Modify: `frontend/src/styles.scss`

**Interfaces:**
- Produces: CSS custom properties on `:root` used by every subsequent task — `--bg-base`, `--bg-surface`, `--bg-sidebar`, `--accent`, `--text-primary`, `--text-muted`, `--green`, `--red`, `--border`

- [ ] **Step 1: Replace `styles.scss` entirely**

Full replacement — do not keep the old content:

```scss
@use '@angular/material' as mat;

@include mat.core();

$app-primary: mat.define-palette(mat.$amber-palette, 600, 400, 800);
$app-accent:  mat.define-palette(mat.$teal-palette, A400);
$app-theme:   mat.define-dark-theme((
  color: (primary: $app-primary, accent: $app-accent),
  typography: mat.define-typography-config(),
  density: 0,
));

@include mat.all-component-themes($app-theme);

:root {
  --bg-base:      #0d0d0d;
  --bg-surface:   #1f2937;
  --bg-sidebar:   #111827;
  --accent:       #f59e0b;
  --text-primary: #f9fafb;
  --text-muted:   #9ca3af;
  --green:        #10b981;
  --red:          #ef4444;
  --border:       rgba(255, 255, 255, 0.08);
}

html, body { height: 100%; }
body {
  margin: 0;
  font-family: Roboto, "Helvetica Neue", sans-serif;
  background: var(--bg-base);
  color: var(--text-primary);
}
```

- [ ] **Step 2: Start the dev server and verify dark Material baseline**

```bash
cd frontend && npm start
```

Open `http://localhost:4200`. Expected: app loads with a dark background, amber-tinted Material components (buttons, tabs, chips all dark-themed). The page should not be white anymore. Check for any console errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.scss
git commit -m "style: apply dark Material theme with brand color variables"
```

---

### Task 2: Responsive Sidenav & App Shell

**Files:**
- Modify: `frontend/src/app/app.component.ts`
- Modify: `frontend/src/app/app.component.html`
- Modify: `frontend/src/app/app.component.scss` (currently empty — write from scratch)

**Interfaces:**
- Consumes: `--bg-sidebar`, `--bg-base`, `--accent`, `--text-primary`, `--border` from Task 1
- Produces: a sticky top toolbar with hamburger on mobile, a collapsible sidenav with brand header and gold active-link style

- [ ] **Step 1: Update `app.component.ts`**

Full replacement:

```typescript
import { Component, OnInit, ViewChild } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet, RouterLink, RouterLinkActive,
    MatSidenavModule, MatToolbarModule, MatListModule,
    MatIconModule, MatButtonModule,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'Stratton Oakmont';
  isMobile = false;

  @ViewChild('sidenav') sidenav!: MatSidenav;

  constructor(
    private breakpointObserver: BreakpointObserver,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.breakpointObserver.observe('(max-width: 768px)').subscribe(result => {
      this.isMobile = result.matches;
    });
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      if (this.isMobile && this.sidenav?.opened) {
        this.sidenav.close();
      }
    });
  }
}
```

- [ ] **Step 2: Update `app.component.html`**

Full replacement:

```html
<mat-sidenav-container class="app-container">
  <mat-sidenav #sidenav
    [mode]="isMobile ? 'over' : 'side'"
    [opened]="!isMobile"
    class="app-sidenav">
    <div class="sidenav-header">
      <mat-icon class="brand-icon">show_chart</mat-icon>
      <span class="brand-name">Stratton Oakmont</span>
    </div>
    <mat-nav-list>
      <a mat-list-item routerLink="/dashboard" routerLinkActive="active-link">
        <mat-icon matListItemIcon>dashboard</mat-icon>
        <span matListItemTitle>Dashboard</span>
      </a>
      <a mat-list-item routerLink="/trade-log" routerLinkActive="active-link">
        <mat-icon matListItemIcon>receipt_long</mat-icon>
        <span matListItemTitle>Trade Log</span>
      </a>
      <a mat-list-item routerLink="/bot-config" routerLinkActive="active-link">
        <mat-icon matListItemIcon>settings</mat-icon>
        <span matListItemTitle>Bot Config</span>
      </a>
      <a mat-list-item routerLink="/bot-logs" routerLinkActive="active-link">
        <mat-icon matListItemIcon>terminal</mat-icon>
        <span matListItemTitle>Bot Logs</span>
      </a>
      <a mat-list-item routerLink="/agent-logs" routerLinkActive="active-link">
        <mat-icon matListItemIcon>smart_toy</mat-icon>
        <span matListItemTitle>Agent Logs</span>
      </a>
    </mat-nav-list>
  </mat-sidenav>

  <mat-sidenav-content class="app-content">
    <mat-toolbar class="app-toolbar">
      <button mat-icon-button *ngIf="isMobile" (click)="sidenav.toggle()" aria-label="Toggle navigation">
        <mat-icon>menu</mat-icon>
      </button>
      <mat-icon class="toolbar-brand-icon">show_chart</mat-icon>
      <span class="toolbar-title">{{ title }}</span>
    </mat-toolbar>
    <div class="page-content">
      <router-outlet />
    </div>
  </mat-sidenav-content>
</mat-sidenav-container>
```

- [ ] **Step 3: Write `app.component.scss`**

Full replacement (currently empty):

```scss
.app-container {
  height: 100vh;
}

.app-sidenav {
  width: 220px;
  background: var(--bg-sidebar) !important;
  border-right: 1px solid var(--border) !important;
}

.sidenav-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
}

.brand-icon {
  color: var(--accent);
  font-size: 22px;
  width: 22px;
  height: 22px;
}

.brand-name {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--text-primary);
}

.active-link {
  border-left: 3px solid var(--accent) !important;
  background: rgba(245, 158, 11, 0.08) !important;

  mat-icon, span {
    color: var(--accent) !important;
  }
}

.app-toolbar {
  background: var(--bg-sidebar) !important;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  position: sticky;
  top: 0;
  z-index: 100;
}

.toolbar-brand-icon {
  color: var(--accent);
  margin-right: 8px;
  font-size: 20px;
  width: 20px;
  height: 20px;
}

.toolbar-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.app-content {
  background: var(--bg-base);
}

.page-content {
  padding: 24px;

  @media (max-width: 768px) {
    padding: 16px;
  }
}
```

- [ ] **Step 4: Verify in browser**

Dev server should still be running. Open `http://localhost:4200`:

- Desktop (> 768px): dark navy sidebar visible, gold `show_chart` icon + "Stratton Oakmont" brand header, gold left border on active nav link, sticky dark toolbar, no hamburger icon
- Mobile (resize to < 768px or DevTools → 375px): sidebar hidden, hamburger `☰` appears in toolbar, tap it → sidebar slides in as overlay, navigate to any page → sidebar closes automatically

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/app.component.ts frontend/src/app/app.component.html frontend/src/app/app.component.scss
git commit -m "feat: add responsive sidenav with hamburger nav and brand header"
```

---

### Task 3: Dashboard

**Files:**
- Modify: `frontend/src/app/dashboard/dashboard.component.scss`
- Modify: `frontend/src/app/dashboard/dashboard.component.html`

**Interfaces:**
- Consumes: `--bg-surface`, `--border`, `--accent`, `--green`, `--red`, `--text-muted` from Task 1

- [ ] **Step 1: Replace `dashboard.component.scss` entirely**

```scss
.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
}

.bot-control {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.cards-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin: 24px 0;
}

mat-card {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border) !important;
  border-radius: 12px !important;
}

.amount {
  font-size: 28px;
  font-weight: 500;
  color: var(--accent);
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
  color: var(--red);
  padding: 16px;
  border: 1px solid var(--red);
  border-radius: 4px;
  margin: 16px 0;
}

.positive { color: var(--green); }
.negative { color: var(--red); }

.portfolio-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.status-icon {
  font-size: 14px;
  width: 14px;
  height: 14px;
  &.open   { color: var(--green); }
  &.closed { color: var(--text-muted); }
}

.phase2-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: var(--text-muted);
}

.table-scroll {
  overflow-x: auto;
  width: 100%;
}

table { width: 100%; }

.market-open {
  background-color: rgba(16, 185, 129, 0.15) !important;
  color: var(--green) !important;
}

.market-closed {
  background-color: rgba(255, 255, 255, 0.05) !important;
  color: var(--text-muted) !important;
}

.charts-section {
  margin-bottom: 32px;
}

.charts-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 16px;
}
```

- [ ] **Step 2: Wrap the Open Positions table in `dashboard.component.html`**

Find lines 103–131 (the `<h2>` + `<table mat-table ...>` block). Wrap just the table (not the `h2`) in a scroll div. Replace:

```html
  <h2 *ngIf="portfolio">Open Positions</h2>
  <table mat-table [dataSource]="portfolio.positions" *ngIf="portfolio">
```

With:

```html
  <h2 *ngIf="portfolio">Open Positions</h2>
  <div class="table-scroll">
  <table mat-table [dataSource]="portfolio.positions" *ngIf="portfolio">
```

And close the div just before `</ng-template>` — replace:

```html
    <tr mat-header-row *matHeaderRowDef="positionColumns"></tr>
    <tr mat-row *matRowDef="let row; columns: positionColumns;"></tr>
  </table>
</ng-template>
```

With:

```html
    <tr mat-header-row *matHeaderRowDef="positionColumns"></tr>
    <tr mat-row *matRowDef="let row; columns: positionColumns;"></tr>
  </table>
  </div>
</ng-template>
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:4200/dashboard`:

- Desktop: three summary cards in a row with dark surface background and gold amounts, gold border on active nav link
- Mobile (375px): cards stack to single column, dashboard header wraps (title above controls), Open Positions table scrolls horizontally with a finger swipe

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/dashboard/dashboard.component.scss frontend/src/app/dashboard/dashboard.component.html
git commit -m "style: responsive dashboard — grid cards, gold amounts, table scroll"
```

---

### Task 4: Symbol Chart Widget

**Files:**
- Modify: `frontend/src/app/symbol-chart/symbol-chart.component.scss`

**Interfaces:**
- Consumes: `--bg-surface`, `--border`, `--text-primary`, `--text-muted`, `--green`, `--red` from Task 1
- Produces: chart cards with `flex: 1 1 220px` so they fill the `.charts-row` container and wrap naturally

- [ ] **Step 1: Replace `symbol-chart.component.scss` entirely**

```scss
.chart-widget {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px 8px;
  flex: 1 1 220px;
  min-width: 220px;
}

.chart-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}

.symbol-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.5px;
}

.last-price {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary);
}

.change {
  font-size: 12px;
  font-weight: 500;
  &.up   { color: var(--green); }
  &.down { color: var(--red); }
  &.flat { color: var(--text-muted); }
}

svg {
  display: block;
  width: 100%;
  height: 80px;
  overflow: visible;
}

.line {
  fill: none;
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}

.area {
  fill-rule: evenodd;
}

.chart-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 10px;
  color: var(--text-muted);
}

.chart-loading {
  height: 80px;
  display: flex;
  align-items: center;
}

.shimmer {
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, #2a2a2a 25%, #3a3a3a 50%, #2a2a2a 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 1px;
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.chart-error {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:4200/dashboard`. If there are active symbols, chart widgets should:
- Desktop: sit side-by-side, filling the row width
- Mobile (375px): each chart takes full width

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/symbol-chart/symbol-chart.component.scss
git commit -m "style: symbol chart — responsive flex sizing, theme color vars"
```

---

### Task 5: Trade Log

**Files:**
- Modify: `frontend/src/app/trade-log/trade-log.component.html`
- Modify: `frontend/src/app/trade-log/trade-log.component.scss`

**Interfaces:**
- Consumes: `--green`, `--red`, `--text-muted` from Task 1

- [ ] **Step 1: Wrap the table in `trade-log.component.html`**

Replace:

```html
<table mat-table [dataSource]="trades" class="full-width">
```

With:

```html
<div class="table-scroll">
<table mat-table [dataSource]="trades" class="full-width">
```

And replace the closing tag:

```html
</table>
```

With:

```html
</table>
</div>
```

- [ ] **Step 2: Replace `trade-log.component.scss` entirely**

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
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-data {
  text-align: center;
  padding: 32px;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:4200/trade-log`:
- Desktop: table renders full width, action chips are green/red/muted
- Mobile (375px): table scrolls horizontally, filters wrap to multiple lines

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/trade-log/trade-log.component.html frontend/src/app/trade-log/trade-log.component.scss
git commit -m "style: trade log — horizontal-scroll table, theme-colored action chips"
```

---

### Task 6: Bot Config

**Files:**
- Modify: `frontend/src/app/bot-config/bot-config.component.scss`

**Interfaces:**
- Consumes: `--accent`, `--text-muted` from Task 1

- [ ] **Step 1: Replace `bot-config.component.scss` entirely**

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
  background: rgba(245, 158, 11, 0.08);
  border-left: 3px solid var(--accent);
  border-radius: 4px;
  padding: 12px 16px;
  color: var(--accent);
}

mat-form-field {
  width: 100%;
}

.field-hint {
  margin: -8px 0 4px;
  font-size: 12px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:4200/bot-config`:
- Phase 2 banner (USA tab) should have a gold left border and amber text
- Form fields fill the available width up to 560px max
- Mobile (375px): form fields sit within the padding, nothing overflows

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/bot-config/bot-config.component.scss
git commit -m "style: bot config — dark phase2 banner, theme color vars"
```

---

### Task 7: Bot Logs

**Files:**
- Modify: `frontend/src/app/bot-logs/bot-logs-page.component.scss`

**Interfaces:**
- Consumes: `--bg-surface`, `--border`, `--accent`, `--text-primary`, `--text-muted`, `--red` from Task 1

- [ ] **Step 1: Replace `bot-logs-page.component.scss` entirely**

Note: the existing `.symbol { color: #141414 }` is a bug — near-black on a dark background. This is fixed to `var(--accent)`.

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

  @media (max-width: 768px) {
    width: 100%;
  }
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 12px;
  color: var(--text-muted);
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
  color: var(--text-muted);

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
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  flex-wrap: wrap;

  &:hover {
    background: var(--bg-surface);
  }
}

.timestamp {
  font-size: 11px;
  color: var(--text-muted);
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
    background: rgba(100, 181, 246, 0.12);
    color: #64b5f6;
  }

  &.level-warn {
    background: rgba(245, 158, 11, 0.12);
    color: var(--accent);
  }

  &.level-error {
    background: rgba(239, 68, 68, 0.12);
    color: var(--red);
  }
}

.event-chip {
  font-size: 11px;
  background: var(--bg-surface);
  color: var(--text-muted);
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
}

.symbol {
  font-weight: 700;
  color: var(--accent);
  min-width: 80px;
}

.message {
  color: var(--text-primary);
  flex: 1;
}

.log-count {
  font-size: 11px;
  color: var(--text-muted);
  padding: 4px 12px 8px;
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 20px;

  button {
    color: var(--text-muted);
    border-color: var(--border);
    font-size: 13px;
  }
}
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:4200/bot-logs`:
- Level badges: info = blue, warn = amber/gold, error = red
- Symbol text is gold (not invisible black)
- Mobile (375px): search field expands full width, filter chip rows wrap below it

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/bot-logs/bot-logs-page.component.scss
git commit -m "style: bot logs — theme color vars, fix invisible symbol color, responsive search"
```

---

### Task 8: Agent Logs

**Files:**
- Modify: `frontend/src/app/agent-log/agent-log.component.scss`
- Modify: `frontend/src/app/agent-logs/agent-logs-page.component.scss`

**Interfaces:**
- Consumes: `--bg-surface`, `--bg-sidebar`, `--border`, `--accent`, `--text-primary`, `--text-muted`, `--green`, `--red` from Task 1

- [ ] **Step 1: Replace `agent-log.component.scss` entirely**

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

.log-entry {
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 16px;
  overflow: hidden;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
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
  margin-left: 4px;
}

.executed-badge {
  font-size: 11px;
  background: rgba(16, 185, 129, 0.15);
  color: var(--green);
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 600;
  letter-spacing: 0.5px;
  margin-left: auto;
}

.log-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--border);

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

- [ ] **Step 2: Replace `agent-logs-page.component.scss` entirely**

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

- [ ] **Step 3: Verify in browser**

Open `http://localhost:4200/agent-logs`:
- Desktop: Input and Claude bubbles sit side-by-side, Claude bubble has gold left border
- Mobile (375px): bubbles stack vertically, Claude bubble has gold top border instead
- Executed badge is green, action badges are green/red/muted

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/agent-log/agent-log.component.scss frontend/src/app/agent-logs/agent-logs-page.component.scss
git commit -m "style: agent logs — dark bubbles, gold accent, mobile column stacking"
```

---

## Self-Review Checklist

- [x] **Global theme** — Task 1 ✓
- [x] **Responsive sidenav / hamburger** — Task 2 ✓
- [x] **Dashboard grid cards + table scroll** — Task 3 ✓
- [x] **Symbol chart responsive sizing** — Task 4 ✓
- [x] **Trade log table scroll + action chip colors** — Task 5 ✓
- [x] **Bot config phase2 banner dark** — Task 6 ✓
- [x] **Bot logs level badges + symbol color fix** — Task 7 ✓
- [x] **Agent logs mobile column + bubble styles** — Task 8 ✓
- [x] No placeholders ("TBD", "TODO") found
- [x] CSS variable names consistent across all tasks (`--accent`, `--green`, `--red`, `--text-muted`, `--bg-surface`, `--bg-sidebar`, `--bg-base`, `--border`, `--text-primary`)
- [x] No `.ts` files touched except `app.component.ts`
