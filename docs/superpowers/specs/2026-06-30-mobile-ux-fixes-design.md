# Mobile UX Fixes: Safe-Area Margin, Pull-to-Refresh, Edge-Swipe Menu, App Icon — Design Spec

**Date:** 2026-06-30
**Scope:** Four related mobile-shell fixes to the existing Angular app (`frontend/`), applied once at the app-shell level so they take effect on every page. The IBKR live-account login bug is tracked separately (diagnostic work, not a design item — see [[project-mobile-ibkr-auth]]).

Related prior work: [[project-mobile-ibkr-auth]] (PR #3, `2026-06-30-mobile-ibkr-auth-design.md`) added the Capacitor iOS shell and the first pass at safe-area CSS.

---

## Background

`frontend/src/app/app.component.html` / `.ts` is the single shell that wraps every page via `<router-outlet>` inside `<mat-sidenav-container>`. All four UI fixes below are implemented once in this shell (plus `styles.scss`), not per-page, so "present on every page" is automatic rather than requiring changes to `dashboard`, `trade-log`, `bot-config`, `bot-logs`, and `agent-logs` individually.

**Deployment note:** Production auto-deploys only on push to `main` (`.github/workflows/deploy.yml`). PR #3 (which added the first safe-area CSS pass, commit `9749d64`) merged into `qa`, not `main` — it was never deployed to `gsfawkes.duckdns.org:5001`. This is the most likely reason the margin issue is still visible in the screenshot despite the CSS already existing on `qa`. All work in this spec must eventually reach `main` (via the normal qa→main promotion) to actually appear on the live site the phone hits. The app icon is a native asset baked at Xcode build time, so it additionally requires a `npx cap sync ios` + Xcode rebuild + reinstall on the device (same manual step already pending from PR #3) — it will not show up from a web deploy alone.

---

## 1. Safe-area top margin fix

**Problem:** `styles.scss` already sets `--sat: env(safe-area-inset-top)` and applies it to `.app-toolbar`, but `env(safe-area-inset-top)` is unreliable outside a true standalone/native rendering context (e.g. plain mobile Safari with its chrome auto-hidden, which is what the screenshot shows — no address bar, no bottom toolbar). The result is little or no effective padding.

**File:** `frontend/src/styles.scss`

**Fix:** Replace the reliance on a bare `env()` value with a value that has both a sane floor and extra breathing room:

```scss
html {
  --sat: max(env(safe-area-inset-top), 20px);
  --sab: env(safe-area-inset-bottom);
}

.app-toolbar {
  padding-top: calc(var(--sat) + 12px);
  height: calc(56px + var(--sat) + 12px) !important;
}
```

This guarantees at least a 32px gap between the toolbar content and the top of the viewport even when `env(safe-area-inset-top)` reports 0, while still growing correctly under a real notch/Dynamic Island (native shell or standalone PWA) where the env value is larger.

---

## 2. Pull-to-refresh (every page)

**Approach:** Pure TypeScript touch-event handling in the app shell — no new npm dependency, no native Capacitor plugin, works identically in desktop browser mobile emulation, mobile Safari, and the native Capacitor WebView with no Xcode rebuild required for iteration.

**Files:**
- New: `frontend/src/app/shared/pull-to-refresh.directive.ts`
- Applied to the `.page-content` wrapper in `app.component.html`

**Behavior:**
- Listens for `touchstart` on the scroll container. Only arms if `scrollTop === 0` at touch start (so it doesn't hijack normal downward scrolling mid-page).
- On `touchmove`, if the vertical drag distance exceeds a small dead zone (~8px) and is predominantly vertical (not horizontal — see interaction with edge-swipe below), track the pull distance and reveal a spinner/arrow indicator that scales/rotates with pull distance, capped at a max visual offset (~90px) with resistance past the threshold.
- On `touchend`: if pulled past ~70px, keep the spinner visible and call `window.location.reload()` (full reload, per user decision). If released before the threshold, animate the indicator back to hidden with no action.
- Indicator markup: a small fixed-position `div` at the top of `.page-content`, containing a Material spinner (`mat-progress-spinner` or a plain CSS spinner to avoid layout dependency), hidden (`transform: translateY(-100%)`) at rest.

**Interaction with edge-swipe (below):** a gesture is classified once early in `touchmove` based on the dominant axis of the first ~10px of movement — vertical drag → pull-to-refresh candidate; horizontal drag starting near the left edge → menu-swipe candidate. Once classified, the other handler ignores the rest of that touch sequence.

---

## 3. Edge-swipe to open the hamburger menu

**Files:**
- New: `frontend/src/app/shared/edge-swipe.directive.ts` (or folded into the same shared touch-gesture service as pull-to-refresh, sharing the axis-classification logic)
- Applied to `.app-content` in `app.component.html`, wired to the existing `#sidenav` `ViewChild`

**Behavior:**
- Only arms when `isMobile === true` and `sidenav.opened === false` (desktop `side` mode and an already-open sidenav are both no-ops).
- Only arms if `touchstart` occurs within ~24px of the left edge of the viewport (standard iOS edge-gesture zone width).
- On `touchmove`, once horizontal drag exceeds the same ~8px dead zone and is predominantly horizontal, track the drag.
- On `touchend`, if dragged right past ~50px, call `sidenav.open()`. Otherwise no-op (no partial/interactive drag-to-reveal — keep it simple, matching Material's own `open()`/`close()` animation).

---

## 4. App icon

**Source:** attached reference image (lion head in circle, black on white/transparent), scaled/cropped so the circular mark fills the square icon canvas edge-to-edge on a white background (per user decision) — iOS applies its own corner rounding, so the source asset itself must be a full square with minimal padding around the circle.

**Files:** `frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/` — regenerate all required sizes (the appiconset `Contents.json` already lists the needed dimensions for iPhone + App Store) from the single source image, replacing the current default Capacitor icon.

**Note:** `frontend/ios/` is gitignored (Xcode-generated, per the PR #3 spec) — the icon asset lives only in the local Xcode project the user builds from, not in the web bundle. This change requires the same manual Xcode build/install step already pending from PR #3; it cannot be delivered via the web deploy pipeline.

---

## Out of Scope

- Per-page custom refresh logic (e.g., re-fetching only changed data) — full reload is the agreed behavior.
- Interactive/rubber-band drag-to-reveal animation for the sidenav during edge-swipe — open/close uses Material's existing built-in animation, triggered once past threshold.
- Android icon assets (iOS-only app, per PR #3 scope).
- The IBKR live-account login bug — tracked as a separate diagnostic investigation, not part of this design.
