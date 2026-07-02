# UI/UX Polish Pass — Space Usage & Structure

**Date:** 2026-07-02
**Scope:** UI/UX only — layout, structure, typography. No changes to business logic, API contracts, or data models. Existing color tokens (`--bg-base`, `--bg-surface`, `--bg-sidebar`, `--accent`, `--text-primary`, `--text-muted`, `--green`, `--red`, `--border`) are unchanged.

## 1. Motivation

The user likes the app's dark/orange color scheme but flagged that several pages have odd structure and don't use screen space well: Agent Logs (a long flat list of skinny full-width rows, mostly repetitive HOLD entries, big empty area beside them on wide screens), Bot Config (toggle + save button float with dead space around them, no clear frame ties sections together), and Trade Log (a near-empty table with a huge dead void below 1-2 rows). The app also ships as a native iOS app via Capacitor on iPhone 17, so every change must work well at both a wide desktop viewport and a ~390px mobile viewport.

Design directions were explored and approved with the user via mockups (browser-based visual companion) before writing this spec. Approved directions per page are recorded below.

## 2. Typography

Replace the default Roboto-only setup with a pairing suited to a data-dense financial dashboard:
- **UI text (headings, labels, body):** Fira Sans
- **Numeric/tabular data (prices, quantities, percentages, timestamps in tables):** Fira Code, using `font-variant-numeric: tabular-nums` so columns of numbers stay aligned and don't visually jitter as values update.

Changes:
- `frontend/src/index.html`: swap the Google Fonts `<link>` from Roboto-only to Fira Sans (weights 400/500/600/700) + Fira Code (weights 400/500).
- `frontend/src/styles.scss`: update the base `font-family` to Fira Sans, add a `.tabular-nums` utility class (or a `--font-mono` variable) applied to numeric values in tables/cards/detail panels.
- This is additive only — no color token changes.

## 3. Agent Logs — Master-Detail Split View

**Desktop (≥768px):** Replace the current single full-width expandable list with a two-pane layout inside `agent-log.component`:
- **Left pane (~38% width, min 280px):** compact single-line rows — symbol, market badge, time, action badge. No inline expansion. Clicking a row sets it as selected (component state, not routing) and highlights it (left accent border + subtle background tint, matching the existing `active-link` treatment in the sidenav).
- **Right pane (remaining width):** detail panel for the currently selected row — all fields Agent Logs already shows today (Input bubble: Last Price, Day Change %, Volume, RSI, MA20, MA50, 5d Change %, Volume Ratio; Claude bubble: Quantity, Confidence, Reason), styled as sectioned bubbles like today, just relocated into the detail pane instead of an inline accordion.
- Selecting the first (most recent) row by default when the list loads/refreshes, so the detail pane is never empty on desktop.
- The existing "Action: All/Buy/Sell/Hold" filter row stays above both panes, filtering the left list; if the currently-selected row gets filtered out, fall back to selecting the new first visible row.
- The "Requests example" panel (already built) stays above this master-detail section, unaffected.

**Mobile (<768px):** No split view — list only, full width, same compact single-line rows. Tapping a row is a **view-state toggle within the same component** (not a new Angular route): the component renders either "list mode" or "detail mode" based on a `mobileSelectedId` field. Selecting a row in list mode switches to detail mode showing a full-screen detail view with a "‹ Back" affordance at the top that returns to list mode. No deep-linking to individual log entries — consistent with the rest of this app, which doesn't do per-item deep links elsewhere.

## 4. Bot Config — Sectioned Cards

Restructure each tab's content (`bot-config.component.html`, both MX and USA tabs identically) from the current loose `.config-section` flex column into three distinct bordered cards, visually matching the existing `.ibkr-account-card` style already at the top of the page:

1. **Symbols card** — the chip-listbox, unchanged content.
2. **Trading Parameters card** — the existing 3-column grid (Capital Limit / Check Frequency / Confidence Threshold), unchanged fields and responsive collapse-to-1-column behavior at 768px.
3. **Status & Save card** — the Active/Inactive toggle and the "Save Configuration" button, in one row (`justify-content: space-between`), so they're framed together instead of floating separately with dead space between them.

Each card: `background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px;` (matching `.ibkr-account-card`'s existing treatment), with `gap: 16px` between the three cards.

## 5. Trade Log — Content-Sized Table + Empty/Sparse State

- Remove any implicit full-page-height stretch on the table container — it should size to its actual row count, not leave a large empty void styled as part of the table.
- Below the table (or in place of it, when there are zero trades), add a guidance footer: `"That's everything so far — N trade(s) executed"` plus a muted secondary line `"New trades will appear here automatically as the bot executes them."` Zero-trade state uses the same footer with `N = 0` and adjusted copy ("No trades yet").
- **Mobile (<768px):** table becomes stacked cards (one per trade), each card showing all the same fields (Date, Symbol, Market, Action, Qty, Price, Currency, Agent Reason) in a labeled key-value layout. The "Agent Reason" text wraps in full rather than being truncated with an ellipsis, on both desktop and mobile — desktop currently truncates this column, which will change to wrap instead per accessibility best practice (prefer wrapping over truncation).

## 6. Bot Logs — No Structural Change

Bot Logs entries are already single dense lines (timestamp, level badge, event type, symbol, message) with no hidden content behind them — there's nothing to reveal in a detail panel, so master-detail doesn't apply here. Scope for this page is minor visual polish only, for consistency with the rest of the pass:
- Row hover state (subtle background tint on hover, matching interactive-row treatment used elsewhere).
- Alternating row background (very subtle, `rgba(255,255,255,0.02)`) to help scan long lists.
- No changes to filtering, search, or the level/market chip rows.

## 7. Dashboard — No Structural Change

Dashboard already uses space well (stat card row + 60-day chart grid + open positions). No layout changes. It picks up the typography change (§2) automatically via shared global styles; no page-specific work.

## 8. Responsive Strategy

- Continue using the existing `@media (max-width: 768px)` breakpoint convention already used throughout the app (`bot-config.component.scss`, `symbol-chart.component.ts`, `styles.scss`) — no new breakpoints introduced.
- The Agent Logs/Trade Log mobile "detail mode" (§3, §5) is implemented as component-local view state, not Angular routing — no new routes are added.
- All new card/panel components must respect existing safe-area handling already in place in `styles.scss` (`--sat`/`--sab` env() insets) — nothing new needed here since these are content-area changes, not top/bottom chrome changes.

## 9. Out of Scope

- No changes to the color palette/tokens.
- No changes to business logic, API routes, Prisma models, or the Claude agent prompt.
- No new Angular routes/deep-linking.
- Bot Logs' filtering/search behavior stays as-is.
- The IBKR auth-gate modal and app shell (toolbar/sidenav) are not touched — those were addressed in the earlier `2026-06-29-responsive-redesign-design.md` and `2026-06-30-mobile-ux-fixes-design.md` passes.
