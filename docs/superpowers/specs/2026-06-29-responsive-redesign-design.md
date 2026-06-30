# Responsive Redesign — Stratton Oakmont Frontend

**Date:** 2026-06-29
**Scope:** UI/UX only — no changes to business logic, services, or component `.ts` files except `app.component.ts` (BreakpointObserver for drawer mode).
**Approach:** Option B — Theme + layout refactor using Angular Material dark theming and BreakpointObserver.

---

## 1. Global Theme

Replace the current indigo/pink Material light theme in `styles.scss` with a custom dark theme.

### Material Theming
- Use `mat.define-dark-theme()` with `mat.$amber-palette` as primary (closest standard palette to `#f59e0b`) and `mat.$teal-palette` as accent.
- Call `mat.all-component-themes($app-theme)` to cascade dark styles to all Material components.
- The exact brand gold (`#f59e0b`) is applied via `--accent` CSS variable for all custom UI elements (cards, borders, active states). Material components use the amber palette; custom elements use the variable.

### CSS Custom Properties (on `:root`)

| Variable | Value | Usage |
|---|---|---|
| `--bg-base` | `#0d0d0d` | Page background |
| `--bg-surface` | `#1f2937` | Cards, panels, bubbles |
| `--bg-sidebar` | `#111827` | Sidenav background |
| `--accent` | `#f59e0b` | Buttons, active states, highlights, portfolio amounts |
| `--text-primary` | `#f9fafb` | Main text |
| `--text-muted` | `#9ca3af` | Secondary text, timestamps, labels |
| `--green` | `#10b981` | Positive P&L, Buy actions, market open |
| `--red` | `#ef4444` | Negative P&L, Sell actions, errors |
| `--border` | `rgba(255,255,255,0.08)` | Card borders, dividers |

### Body / Base
- `body` background: `var(--bg-base)`
- `body` color: `var(--text-primary)`
- Font stays Roboto

---

## 2. Layout & Navigation

### Files changed: `app.component.ts`, `app.component.html`, `app.component.scss`

### `app.component.ts`
- Inject `BreakpointObserver` (Angular CDK)
- Subscribe to `Breakpoints.Handset` (or `(max-width: 768px)`)
- Expose `isMobile: boolean` signal/property
- Add `@ViewChild('sidenav') sidenav: MatSidenav`

### `app.component.html`
- Sidenav: `[mode]="isMobile ? 'over' : 'side'"` and `[opened]="!isMobile"`
- Toolbar: add hamburger `<button mat-icon-button *ngIf="isMobile" (click)="sidenav.toggle()">` with `menu` icon
- Toolbar title: `<span class="app-title">Stratton Oakmont</span>` — styled with letter-spacing and a gold `◆` prefix icon
- Nav links: active state styled with left gold border (`3px solid var(--accent)`) + subtle background (`rgba(245,158,11,0.08)`)
- Sidenav close-on-navigate: on mobile, subscribe to router events and call `sidenav.close()` after navigation

### `app.component.scss`
- Sidenav background: `var(--bg-sidebar)`
- Active nav item: left border + background as described above
- Toolbar: `background: var(--bg-sidebar)`, title `color: var(--text-primary)`
- Page content wrapper: `padding: 24px` on desktop, `padding: 16px` on mobile (`@media (max-width: 768px)`)

### Breakpoints
| Screen | Behavior |
|---|---|
| `> 768px` | Sidebar `mode="side"`, always open, 220px |
| `≤ 768px` | Sidebar `mode="over"`, closed by default, hamburger in toolbar |

---

## 3. Dashboard

### Files changed: `dashboard.component.scss`

- **Summary cards** (`cards-row`): change `display: flex` to `display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))`. Cards fill available space and stack to single column on mobile.
- **Card styling**: `background: var(--bg-surface)`, `border: 1px solid var(--border)`, `border-radius: 12px`.
- **Amount value**: color `var(--accent)` to make portfolio numbers visually prominent.
- **Dashboard header**: `flex-wrap: wrap` with `gap: 12px` so title and bot-control stack on mobile.
- **Symbol charts** (`chart-widget`): remove `width: 280px; flex-shrink: 0`, replace with `flex: 1 1 220px; min-width: 220px`. Charts fill available space and wrap. Single chart = full width on mobile.
- **Open Positions table**: wrap in `<div class="table-scroll">` with `overflow-x: auto`.
- **Error banner**: border color `var(--red)`, text `var(--red)`.
- **Portfolio status bar**: text color `var(--text-muted)`.
- **Market open chip**: green (`var(--green)`), market closed chip: muted (`var(--text-muted)`).

---

## 4. Trade Log

### Files changed: `trade-log.component.html`, `trade-log.component.scss`

- Wrap `<table>` in `<div class="table-scroll" style="overflow-x: auto">`.
- Action chips: `action-buy` → green, `action-sell` → red, `action-hold` → muted — using theme variables instead of hardcoded hex.
- Filters row: already wraps; update spacing and form field colors to match dark theme.

---

## 5. Bot Config

### Files changed: `bot-config.component.scss`

- Config section: `max-width: 600px` to prevent awkward stretching on wide screens.
- Form fields (`mat-form-field`): `width: 100%`.
- Selected chip options: use `var(--accent)` for selected state background.
- Phase 2 banner: `background: rgba(245,158,11,0.1)`, `border-left: 3px solid var(--accent)`.

---

## 6. Bot Logs

### Files changed: `bot-logs-page.component.scss`

- Controls row: stacks vertically on mobile (search field full-width, chips below).
- Log row: reduce padding on mobile; `flex-wrap: wrap` so long messages don't overflow.
- Level badges: `info` → blue-muted, `warn` → amber (`var(--accent)`), `error` → red (`var(--red)`).

---

## 7. Agent Logs

### Files changed: `agent-log.component.scss`

- `log-body`: `display: flex; gap: 12px` on desktop. On mobile: `flex-direction: column`.
- Input bubble: `background: var(--bg-surface)`, `border: 1px solid var(--border)`, `border-radius: 8px`.
- Claude bubble: same surface style but with a subtle left accent border (`3px solid var(--accent)`).
- Action badge colors: BUY → `var(--green)`, SELL → `var(--red)`, HOLD → `var(--text-muted)`.
- Toggle panel chips: use `var(--accent)` for active state.

---

## 8. Symbol Chart Widget

### Files changed: `symbol-chart.component.scss`

- Widget already dark (`#1e1e1e`) — update to `var(--bg-surface)` for consistency.
- Borders: `var(--border)`.
- Responsive width: handled by dashboard's grid/flex container (see Section 3).

---

## Constraints

- **No `.ts` files touched** except `app.component.ts` (BreakpointObserver + sidenav toggle only).
- **No template logic changes** — only layout/style attributes in HTML where necessary (e.g., wrapping a table in a scroll div).
- **No new packages** — Angular CDK `BreakpointObserver` is already available via `@angular/cdk/layout`.
- All functionality (API calls, toggles, filters, routing) remains unchanged.
