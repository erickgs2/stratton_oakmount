# Mobile App & IBKR Auth Gate — Design Spec

**Date:** 2026-06-30
**Scope:** Two sub-projects built in order: (A) IBKR auth gate for the existing Angular dashboard, (B) Capacitor iOS wrapper.

---

## Global Constraints

- Do **not** touch the port 80/443 nginx server — it belongs to another app.
- IBKR gateway stays on port 5000 (internal only, not router-forwarded).
- Port 5002 is currently free on the Pi. It needs a new nginx server block (proxy to port 5000) with SSL, then a router port forward. **nginx is already installed — do not reinstall it.**
- Angular project lives in `frontend/`. All Capacitor files go inside `frontend/`.
- `frontend/ios/` is Xcode-generated and must be added to `.gitignore`.
- `frontend/src/environments/environment.prod.ts` already sets `apiUrl: '/api'` — no change needed.
- The IBKR gateway URL for external access is `https://gsfawkes.duckdns.org:5002`. This is a known constant for a personal app; it is stored in environment files, not hardcoded inline.

---

## Sub-project A: IBKR Auth Gate

### Problem

The IBKR Client Portal Gateway session expires roughly every 24 hours. When the session lapses, all IBKR API calls (positions, orders, agent cycles) fail silently or with cryptic errors. The user currently re-authenticates via SSH port-forward. The fix: detect the lapsed session automatically and redirect the user to the IBKR login page on port 5002.

### Architecture

```
Angular app (port 5001)
  └─ IbkrAuthService (polls /api/ibkr-auth-status every 60s when connected, 3s when disconnected)
       └─ IbkrAuthGateComponent (fullscreen overlay, shown when disconnected)
            └─ "Open IBKR Login" button → opens gsfawkes.duckdns.org:5002
                 Web: window.open()
                 iOS native: @capacitor/browser Browser.open()  [wired up in Sub-project B]

Next.js backend
  └─ GET /api/ibkr-auth-status
       └─ pings https://127.0.0.1:5000/v1/api/iserver/auth/status
            → { connected: boolean }
```

### Backend: `/api/ibkr-auth-status`

**File:** `backend/app/api/ibkr-auth-status/route.ts`

- `export const dynamic = 'force-dynamic'` — no response caching.
- `GET` handler: calls `https://127.0.0.1:5000/v1/api/iserver/auth/status` with `rejectUnauthorized: false` (IBKR gateway uses a self-signed cert on localhost).
- IBKR response shape: `{ authenticated: boolean, connected: boolean, ... }`. Return `{ connected: true }` when `authenticated === true && connected === true`.
- Any network error or non-200 from IBKR → return `{ connected: false }` with HTTP 200. The frontend always gets a valid JSON body.
- Timeout: 5 seconds. If IBKR does not respond within 5s, treat as disconnected.

### Frontend Service: `IbkrAuthService`

**File:** `frontend/src/app/core/services/ibkr-auth.service.ts`

- `providedIn: 'root'`, injectable.
- `connected$ = new BehaviorSubject<boolean>(true)` — assume connected until first check (prevents flash on load).
- `startPolling()`: called once from `AppComponent.ngOnInit()`.
  - Uses `interval()` + `switchMap` or a recursive `setTimeout` pattern.
  - Poll interval: 60 000 ms when connected, 3 000 ms when disconnected.
  - On each tick: GET `/api/ibkr-auth-status`, update `connected$`.
  - Fires an immediate check on start (does not wait for the first interval).
- No public `checkNow()` method needed — polling handles all state transitions.

### Frontend Component: `IbkrAuthGateComponent`

**Files:**
- `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.ts`
- `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.html`
- `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.scss`

**Behavior:**
- Standalone component. Subscribes to `IbkrAuthService.connected$`.
- When `connected === false`: renders a fullscreen fixed-position overlay (z-index above sidenav and all content).
- When `connected === true`: renders nothing (`*ngIf` or `@if`).

**Template layout (when shown):**
```
[dark overlay 100vw × 100vh, z-index: 1000]
  └─ centered card (max-width 360px)
       ├─ mat-icon "link_off" (large, amber)
       ├─ h2: "Session Inactive"
       ├─ p: "The IBKR trading gateway needs authentication before the dashboard can connect."
       ├─ button mat-flat-button color="primary": "Open IBKR Login"
       └─ small: "Checking connection…" (visible while not-yet-connected)
```

**`openLogin()` method:**
```typescript
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

async openLogin(): Promise<void> {
  const url = environment.gatewayLoginUrl;   // 'https://gsfawkes.duckdns.org:5002'
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });             // SFSafariViewController — shares cookie store
  } else {
    window.open(url, '_blank');
  }
}
```

Note: `@capacitor/core` and `@capacitor/browser` are installed as part of Sub-project B. For Sub-project A the `Capacitor.isNativePlatform()` call always returns false (web) — no separate guard needed.

### Environment file additions

`environment.ts`:
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  gatewayLoginUrl: 'https://gsfawkes.duckdns.org:5002',
};
```

`environment.prod.ts`:
```typescript
export const environment = {
  production: true,
  apiUrl: '/api',
  gatewayLoginUrl: 'https://gsfawkes.duckdns.org:5002',
};
```

### App integration

`app.component.html`: add `<app-ibkr-auth-gate />` as the **first child** inside `<body>` / the root element — before `<mat-sidenav-container>`.

`app.component.ts`: inject `IbkrAuthService`, call `this.ibkrAuthService.startPolling()` in `ngOnInit()`.

### Overlay CSS

The overlay uses `position: fixed; inset: 0; z-index: 1000` to cover the entire viewport regardless of scroll position. The dark backdrop is `rgba(0, 0, 0, 0.85)`. The card uses `background: var(--bg-surface); border: 1px solid var(--border); border-radius: 12px; padding: 32px 24px`.

### Pi infrastructure (manual, one-time)

nginx is already installed. These steps are done by the user on the Pi — not automated by the implementation plan.

**1. Add nginx server block for port 5002** (edit `/etc/nginx/sites-available/` or the main nginx config):
```nginx
server {
    listen 5002 ssl;
    server_name gsfawkes.duckdns.org;

    # Reuse the Let's Encrypt cert that already covers this domain
    ssl_certificate     /etc/letsencrypt/live/gsfawkes.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gsfawkes.duckdns.org/privkey.pem;

    location / {
        proxy_pass https://127.0.0.1:5000/;
        proxy_ssl_verify off;   # IBKR gateway uses a self-signed cert
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**2. Reload nginx:** `sudo nginx -t && sudo nginx -s reload`

**3. Router port forward:** forward external TCP port 5002 → Pi LAN IP port 5002.

**SSL cert note:** If `gsfawkes.duckdns.org` already has a Let's Encrypt cert (used for port 5001), reuse it as shown above. If not, obtain one first: `sudo certbot --nginx -d gsfawkes.duckdns.org`.

---

## Sub-project B: Capacitor iOS App

### Problem

The user wants a native iPhone app for personal use. Re-building a separate Ionic project is unnecessary — Capacitor wraps the existing Angular app in a native iOS shell and points the WebView at the live production server. No separate codebase, no rebuild required for everyday use.

### Architecture

```
Xcode → iOS .ipa
  └─ Capacitor WebView (server mode)
       └─ points to https://gsfawkes.duckdns.org:5001  (Angular app on nginx)
            └─ all API calls proxied by nginx to Next.js backend on port 3000
  └─ @capacitor/browser plugin
       └─ opens SFSafariViewController for IBKR login on port 5002
            (shares cookie store with Safari — required for IBKR session cookie)
  └─ @capacitor/status-bar — dark style + brand background color
  └─ @capacitor/splash-screen — short branded splash
```

### Packages

Install inside `frontend/`:
```
npm install @capacitor/core @capacitor/ios @capacitor/browser @capacitor/status-bar @capacitor/splash-screen
npm install -D @capacitor/cli
```

### `capacitor.config.ts`

**File:** `frontend/capacitor.config.ts`

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.strattonoakmont.app',
  appName: 'Stratton Oakmont',
  webDir: 'dist/frontend/browser',
  server: {
    url: 'https://gsfawkes.duckdns.org:5001',
    cleartext: false,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#111827',
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
  },
};

export default config;
```

**Why `server.url`:** In server mode, Capacitor loads the remote URL in the WebView instead of bundled assets. This means the app always shows the current production deployment — no separate iOS build or deploy step when the web app is updated.

### iOS Safe Area

Add to `frontend/src/styles.scss`:
```scss
// Capacitor iOS safe area (notch / Dynamic Island / home indicator)
html {
  --sat: env(safe-area-inset-top);
  --sab: env(safe-area-inset-bottom);
}

.app-toolbar {
  padding-top: var(--sat);
  height: calc(56px + var(--sat)) !important;
}

body {
  padding-bottom: var(--sab);
}
```

Also update `frontend/src/index.html` viewport meta to:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

`viewport-fit=cover` is required for `env(safe-area-inset-*)` to work correctly on notched devices.

### `.gitignore`

Add to `frontend/.gitignore` (or root `.gitignore`):
```
# Capacitor iOS (Xcode-generated, not committed)
/ios/
```

### Build and Xcode Steps

These are one-time setup steps. Subsequent changes to the web app deploy automatically (server mode, no iOS rebuild needed).

1. Inside `frontend/`:
   ```bash
   npx cap add ios
   npx cap sync ios
   npx cap open ios
   ```

2. In Xcode:
   - Set **Team** in Signing & Capabilities (personal Apple ID is sufficient for personal use)
   - Confirm Bundle ID matches `com.strattonoakmont.app`
   - Product → Archive
   - Distribute → Ad Hoc or Development (for direct install via Xcode / Apple Configurator)

3. Install on iPhone via Xcode Devices window or by transferring the `.ipa`.

### `@capacitor/browser` usage in `IbkrAuthGateComponent`

The `openLogin()` method in Sub-project A already contains the platform branch. When Capacitor is present (Sub-project B is implemented), `Capacitor.isNativePlatform()` returns `true` on device and `Browser.open()` opens an `SFSafariViewController`. The IBKR login page sets a session cookie; `SFSafariViewController` shares the cookie store with Safari, so the gateway session carries over when the WebView returns to the app.

---

## Build Order

1. Implement Sub-project A completely (auth gate, backend endpoint, service, overlay component, environment additions).
2. Implement Sub-project B (Capacitor install, config, safe area CSS, `.gitignore`, Xcode steps).
3. Sub-project B is self-contained and does not require changes to Sub-project A's code — the `Capacitor.isNativePlatform()` guard in `openLogin()` handles both environments.

---

## Out of Scope

- IBKR OAuth / token-based authentication (not supported by IBKR Client Portal Gateway).
- Automatic session re-auth (IBKR requires manual login via browser).
- Android build (personal use, iOS only).
- App Store distribution (personal use, direct install).
- Push notifications from the bot.
