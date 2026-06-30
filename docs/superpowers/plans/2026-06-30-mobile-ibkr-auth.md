# Mobile App & IBKR Auth Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an IBKR session auth gate to the Angular dashboard that detects when the IBKR gateway is disconnected and prompts re-authentication, then wrap the Angular app in a Capacitor iOS shell for personal iPhone use.

**Architecture:** The backend exposes `GET /api/ibkr-auth-status` which pings the local IBKR gateway; the Angular `IbkrAuthService` polls this endpoint and exposes `connected$` as a BehaviorSubject; `IbkrAuthGateComponent` renders a fullscreen overlay whenever `connected$` is false. Capacitor wraps the app in server mode (pointing at the live production URL) so no separate build is needed when the web app is updated.

**Tech Stack:** Next.js 14 (backend), Angular 17 standalone components, Angular Material 17, RxJS, Capacitor 6, `@capacitor/browser` (SFSafariViewController), Jest (backend tests), TypeScript.

## Global Constraints

- Do not touch the port 80/443 nginx server — it belongs to another app.
- IBKR gateway is on port 5000 (not router-forwarded). Backend pings it at `https://127.0.0.1:5000/v1/api/iserver/auth/status` using the existing `IBKRClient` which already disables SSL verification for localhost.
- Port 5002 needs a new nginx server block (one-time manual step, documented in Task 6).
- `gatewayLoginUrl` is `'https://gsfawkes.duckdns.org:5002'` in both environment files.
- All Capacitor files live inside `frontend/`. The generated `frontend/ios/` directory must be git-ignored.
- `IBKRClient.request()` is a private method — add `checkAuthStatus()` as a new public method rather than using `request()` from outside the class.
- All Angular components are standalone. Follow the pattern in existing components (`imports: [...]` array, no `NgModule`).
- Backend API route pattern: `export const dynamic = 'force-dynamic'`, named export `GET`/`POST`, `return NextResponse.json(...)`.
- `environment.apiUrl` is already used by all services via `private readonly apiUrl = environment.apiUrl` — follow the same pattern in `IbkrAuthService`.

---

## File Structure

**New files:**
- `backend/app/api/ibkr-auth-status/route.ts` — GET handler, delegates to `ibkrClient.checkAuthStatus()`
- `frontend/src/app/core/services/ibkr-auth.service.ts` — polls `/api/ibkr-auth-status`, exposes `connected$`
- `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.ts`
- `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.html`
- `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.scss`
- `frontend/capacitor.config.ts` — Capacitor config in server mode

**Modified files:**
- `backend/lib/ibkr.ts` — add `checkAuthStatus(): Promise<boolean>` method
- `backend/__tests__/ibkr.test.ts` — add `checkAuthStatus` tests (follow existing pattern)
- `frontend/src/environments/environment.ts` — add `gatewayLoginUrl`
- `frontend/src/environments/environment.prod.ts` — add `gatewayLoginUrl`
- `frontend/src/app/app.component.ts` — inject `IbkrAuthService`, call `startPolling()`, add import
- `frontend/src/app/app.component.html` — add `<app-ibkr-auth-gate />` before sidenav container
- `frontend/src/styles.scss` — add iOS safe area CSS variables
- `frontend/src/index.html` — add `viewport-fit=cover` to viewport meta
- `frontend/.gitignore` — add `/ios/`

---

### Task 1: `checkAuthStatus()` method + backend route

**Files:**
- Modify: `backend/lib/ibkr.ts` (add method after `getOrders()`)
- Create: `backend/app/api/ibkr-auth-status/route.ts`
- Modify: `backend/__tests__/ibkr.test.ts` (add `checkAuthStatus` describe block)

**Interfaces:**
- Produces: `ibkrClient.checkAuthStatus(): Promise<boolean>` — used by route.ts and tested in ibkr.test.ts

- [ ] **Step 1: Add `checkAuthStatus()` to `IBKRClient` in `backend/lib/ibkr.ts`**

  Open `backend/lib/ibkr.ts`. After the `getOrders()` method (around line 150), add:

  ```typescript
  async checkAuthStatus(): Promise<boolean> {
    // 5-second timeout: if the gateway doesn't respond, treat as disconnected
    const timeout = new Promise<false>(resolve => setTimeout(() => resolve(false), 5_000));
    const check = this.request<{ authenticated?: boolean; connected?: boolean }>(
      '/iserver/auth/status'
    )
      .then(data => data.authenticated === true && data.connected === true)
      .catch(() => false);
    return Promise.race([check, timeout]);
  }
  ```

- [ ] **Step 2: Create `backend/app/api/ibkr-auth-status/route.ts`**

  ```typescript
  import { NextResponse } from 'next/server';
  import { ibkrClient } from '@/lib/ibkr';

  export const dynamic = 'force-dynamic';

  export async function GET() {
    const connected = await ibkrClient.checkAuthStatus();
    return NextResponse.json({ connected });
  }
  ```

- [ ] **Step 3: Write failing tests — add to `backend/__tests__/ibkr.test.ts`**

  The file already mocks `https` and has a `mockHttpsResponse` helper. Append a new `describe` block inside the existing `describe('IBKRClient', ...)`:

  ```typescript
  describe('checkAuthStatus', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns true when authenticated and connected', async () => {
      mockHttpsResponse(200, { authenticated: true, connected: true, competing: false });
      const result = await client.checkAuthStatus();
      expect(result).toBe(true);
    });

    it('returns false when not authenticated', async () => {
      mockHttpsResponse(200, { authenticated: false, connected: true });
      const result = await client.checkAuthStatus();
      expect(result).toBe(false);
    });

    it('returns false when connected is false', async () => {
      mockHttpsResponse(200, { authenticated: true, connected: false });
      const result = await client.checkAuthStatus();
      expect(result).toBe(false);
    });

    it('returns false on network error (ECONNREFUSED)', async () => {
      const errorReq = {
        on: jest.fn((event: string, cb: (err: Error) => void) => {
          if (event === 'error') cb(new Error('ECONNREFUSED'));
        }),
        write: jest.fn(),
        end: jest.fn(),
      };
      (https.request as jest.Mock).mockImplementation(() => errorReq);
      const result = await client.checkAuthStatus();
      expect(result).toBe(false);
    });

    it('returns false on non-2xx response', async () => {
      mockHttpsResponse(401, { error: 'Unauthorized' });
      const result = await client.checkAuthStatus();
      expect(result).toBe(false);
    });

    it('returns false when gateway does not respond within 5 seconds', async () => {
      // Request that never resolves
      const hangingReq = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
      (https.request as jest.Mock).mockImplementation(() => hangingReq);

      const promise = client.checkAuthStatus();
      jest.advanceTimersByTime(5_000);
      const result = await promise;
      expect(result).toBe(false);
    });
  });
  ```

- [ ] **Step 4: Run tests — verify they fail (method not yet present)**

  ```bash
  cd backend && npx jest __tests__/ibkr.test.ts --verbose 2>&1 | tail -20
  ```

  Expected: FAIL — `client.checkAuthStatus is not a function`

  _(If you already added the method in Step 1, tests may pass immediately — that's fine, proceed.)_

- [ ] **Step 5: Run tests — verify all pass**

  ```bash
  cd backend && npx jest __tests__/ibkr.test.ts --verbose 2>&1 | tail -20
  ```

  Expected output includes:
  ```
  ✓ returns true when authenticated and connected
  ✓ returns false when not authenticated
  ✓ returns false when connected is false
  ✓ returns false on network error
  ✓ returns false on non-2xx response
  ```

- [ ] **Step 6: Run the full backend test suite to confirm no regressions**

  ```bash
  cd backend && npx jest --verbose 2>&1 | tail -10
  ```

  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add backend/lib/ibkr.ts backend/app/api/ibkr-auth-status/route.ts backend/__tests__/ibkr.test.ts
  git commit -m "feat: add IBKR auth status endpoint and checkAuthStatus method"
  ```

---

### Task 2: Environment additions + `IbkrAuthService`

**Files:**
- Modify: `frontend/src/environments/environment.ts`
- Modify: `frontend/src/environments/environment.prod.ts`
- Create: `frontend/src/app/core/services/ibkr-auth.service.ts`

**Interfaces:**
- Produces: `IbkrAuthService.connected$: BehaviorSubject<boolean>` and `IbkrAuthService.startPolling(): void` — consumed by Task 3 and Task 4
- Produces: `environment.gatewayLoginUrl: string` — consumed by Task 3

- [ ] **Step 1: Update `frontend/src/environments/environment.ts`**

  Replace the file content with:

  ```typescript
  export const environment = {
    production: false,
    apiUrl: 'http://localhost:3000/api',
    gatewayLoginUrl: 'https://gsfawkes.duckdns.org:5002',
  };
  ```

- [ ] **Step 2: Update `frontend/src/environments/environment.prod.ts`**

  Replace the file content with:

  ```typescript
  export const environment = {
    production: true,
    apiUrl: '/api',
    gatewayLoginUrl: 'https://gsfawkes.duckdns.org:5002',
  };
  ```

- [ ] **Step 3: Create `frontend/src/app/core/services/ibkr-auth.service.ts`**

  ```typescript
  import { Injectable, OnDestroy } from '@angular/core';
  import { HttpClient } from '@angular/common/http';
  import { BehaviorSubject } from 'rxjs';
  import { catchError } from 'rxjs/operators';
  import { of } from 'rxjs';
  import { environment } from '../../../environments/environment';

  @Injectable({ providedIn: 'root' })
  export class IbkrAuthService implements OnDestroy {
    readonly connected$ = new BehaviorSubject<boolean>(true);

    private timeoutId: ReturnType<typeof setTimeout> | null = null;
    private readonly apiUrl = environment.apiUrl;

    constructor(private http: HttpClient) {}

    startPolling(): void {
      this.tick();
    }

    private tick(): void {
      this.http
        .get<{ connected: boolean }>(`${this.apiUrl}/ibkr-auth-status`)
        .pipe(catchError(() => of({ connected: false })))
        .subscribe(res => {
          this.connected$.next(res.connected);
          const delay = res.connected ? 60_000 : 3_000;
          this.timeoutId = setTimeout(() => this.tick(), delay);
        });
    }

    ngOnDestroy(): void {
      if (this.timeoutId) clearTimeout(this.timeoutId);
      this.connected$.complete();
    }
  }
  ```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1
  ```

  Expected: no output (no errors).

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/environments/environment.ts frontend/src/environments/environment.prod.ts frontend/src/app/core/services/ibkr-auth.service.ts
  git commit -m "feat: add gatewayLoginUrl to environments and IbkrAuthService"
  ```

---

### Task 3: `IbkrAuthGateComponent`

**Files:**
- Create: `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.ts`
- Create: `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.html`
- Create: `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.scss`

**Interfaces:**
- Consumes: `IbkrAuthService.connected$: BehaviorSubject<boolean>` (from Task 2)
- Consumes: `environment.gatewayLoginUrl: string` (from Task 2)
- Produces: `<app-ibkr-auth-gate />` selector — added to `AppComponent` in Task 4

Note: `openLogin()` uses only `window.open()` here. In Task 5, after Capacitor packages are installed, this is updated to also handle native iOS via `@capacitor/browser`.

- [ ] **Step 1: Create `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.ts`**

  ```typescript
  import { Component, inject } from '@angular/core';
  import { NgIf, AsyncPipe } from '@angular/common';
  import { MatIconModule } from '@angular/material/icon';
  import { MatButtonModule } from '@angular/material/button';
  import { IbkrAuthService } from '../core/services/ibkr-auth.service';
  import { environment } from '../../environments/environment';

  @Component({
    selector: 'app-ibkr-auth-gate',
    standalone: true,
    imports: [NgIf, AsyncPipe, MatIconModule, MatButtonModule],
    templateUrl: './ibkr-auth-gate.component.html',
    styleUrl: './ibkr-auth-gate.component.scss',
  })
  export class IbkrAuthGateComponent {
    protected connected$ = inject(IbkrAuthService).connected$;

    openLogin(): void {
      window.open(environment.gatewayLoginUrl, '_blank');
    }
  }
  ```

- [ ] **Step 2: Create `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.html`**

  ```html
  <div *ngIf="!(connected$ | async)" class="auth-overlay">
    <div class="auth-card">
      <mat-icon class="auth-icon">link_off</mat-icon>
      <h2>Session Inactive</h2>
      <p>The IBKR trading gateway needs authentication before the dashboard can connect.</p>
      <button mat-flat-button color="primary" (click)="openLogin()">
        <mat-icon>open_in_new</mat-icon>
        Open IBKR Login
      </button>
      <small class="checking-label">Checking connection…</small>
    </div>
  </div>
  ```

- [ ] **Step 3: Create `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.scss`**

  ```scss
  .auth-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .auth-card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 32px 24px;
    max-width: 360px;
    width: 100%;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .auth-icon {
    font-size: 48px;
    width: 48px;
    height: 48px;
    color: var(--accent);
  }

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary);
  }

  p {
    margin: 0;
    font-size: 14px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .checking-label {
    font-size: 11px;
    color: var(--text-muted);
  }
  ```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1
  ```

  Expected: no output.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/app/ibkr-auth-gate/
  git commit -m "feat: add IbkrAuthGateComponent overlay"
  ```

---

### Task 4: Wire gate into `AppComponent` + verify

**Files:**
- Modify: `frontend/src/app/app.component.ts`
- Modify: `frontend/src/app/app.component.html`

**Interfaces:**
- Consumes: `IbkrAuthService.startPolling(): void` (from Task 2)
- Consumes: `<app-ibkr-auth-gate />` selector (from Task 3)

- [ ] **Step 1: Update `frontend/src/app/app.component.ts`**

  Add `IbkrAuthGateComponent` to `imports`, inject `IbkrAuthService`, call `startPolling()` in `ngOnInit`. Full file:

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
  import { IbkrAuthService } from './core/services/ibkr-auth.service';
  import { IbkrAuthGateComponent } from './ibkr-auth-gate/ibkr-auth-gate.component';

  @Component({
    selector: 'app-root',
    standalone: true,
    imports: [
      CommonModule,
      RouterOutlet, RouterLink, RouterLinkActive,
      MatSidenavModule, MatToolbarModule, MatListModule,
      MatIconModule, MatButtonModule,
      IbkrAuthGateComponent,
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
      private ibkrAuthService: IbkrAuthService,
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
      this.ibkrAuthService.startPolling();
    }
  }
  ```

- [ ] **Step 2: Update `frontend/src/app/app.component.html`**

  Add `<app-ibkr-auth-gate />` as the first element, before `<mat-sidenav-container>`:

  ```html
  <app-ibkr-auth-gate />

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

- [ ] **Step 3: TypeScript compile check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1
  ```

  Expected: no output.

- [ ] **Step 4: Build the frontend to confirm no bundler errors**

  ```bash
  cd frontend && ng build 2>&1 | tail -10
  ```

  Expected: `Build at: ...` with no errors.

- [ ] **Step 5: Smoke-test the overlay in the browser**

  Start the dev server:
  ```bash
  cd frontend && ng serve
  ```

  Open `http://localhost:4200`. The app should load normally (no overlay), because `connected$` starts as `true` and the first poll will check the backend. If the backend/IBKR is not running locally, the poll will fail and set `connected$` to `false` — you should see the overlay appear within a few seconds. Confirm the overlay appears with the `link_off` icon, heading, and button.

  To force the overlay without a backend: temporarily change `new BehaviorSubject<boolean>(true)` to `false` in `ibkr-auth.service.ts`, check the overlay renders correctly in the browser, then revert.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/app/app.component.ts frontend/src/app/app.component.html
  git commit -m "feat: wire IBKR auth gate into AppComponent"
  ```

---

### Task 5: Capacitor packages + config + safe area + update `openLogin()`

**Files:**
- Create: `frontend/capacitor.config.ts`
- Modify: `frontend/.gitignore` (add `/ios/`)
- Modify: `frontend/src/index.html` (viewport-fit=cover)
- Modify: `frontend/src/styles.scss` (safe area CSS)
- Modify: `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.ts` (add Capacitor branch to `openLogin()`)

**Interfaces:**
- Consumes: `IbkrAuthGateComponent.openLogin()` (from Task 3) — updated here
- Produces: `capacitor.config.ts` — consumed by `npx cap` CLI in Task 6

- [ ] **Step 1: Install Capacitor packages inside `frontend/`**

  ```bash
  cd frontend && npm install @capacitor/core @capacitor/ios @capacitor/browser @capacitor/status-bar @capacitor/splash-screen && npm install -D @capacitor/cli
  ```

  Expected: packages added to `frontend/package.json`, no peer-dependency errors.

- [ ] **Step 2: Create `frontend/capacitor.config.ts`**

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

- [ ] **Step 3: Add `/ios/` to `frontend/.gitignore`**

  Open `frontend/.gitignore` and append at the end:

  ```
  # Capacitor iOS (Xcode-generated, not committed)
  /ios/
  ```

- [ ] **Step 4: Update `frontend/src/index.html` — add `viewport-fit=cover`**

  Change the viewport meta tag from:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ```
  to:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  ```

- [ ] **Step 5: Add safe area CSS to `frontend/src/styles.scss`**

  Append at the end of the file (after existing rules):

  ```scss
  // iOS safe area — notch / Dynamic Island / home indicator
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

- [ ] **Step 6: Update `IbkrAuthGateComponent.openLogin()` to handle Capacitor native**

  Replace `openLogin()` in `frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.ts` to use dynamic import for Capacitor (avoids static import failure if bundle is not on native):

  Full file:
  ```typescript
  import { Component, inject } from '@angular/core';
  import { NgIf, AsyncPipe } from '@angular/common';
  import { MatIconModule } from '@angular/material/icon';
  import { MatButtonModule } from '@angular/material/button';
  import { IbkrAuthService } from '../core/services/ibkr-auth.service';
  import { environment } from '../../environments/environment';

  @Component({
    selector: 'app-ibkr-auth-gate',
    standalone: true,
    imports: [NgIf, AsyncPipe, MatIconModule, MatButtonModule],
    templateUrl: './ibkr-auth-gate.component.html',
    styleUrl: './ibkr-auth-gate.component.scss',
  })
  export class IbkrAuthGateComponent {
    protected connected$ = inject(IbkrAuthService).connected$;

    async openLogin(): Promise<void> {
      const url = environment.gatewayLoginUrl;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cap = (window as any).Capacitor as { isNativePlatform: () => boolean } | undefined;
      if (cap?.isNativePlatform()) {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url });
      } else {
        window.open(url, '_blank');
      }
    }
  }
  ```

  The `window.Capacitor` check means this code works safely when loaded in a normal browser (returns `undefined`, falls through to `window.open`). The dynamic `import('@capacitor/browser')` only executes on device.

- [ ] **Step 7: TypeScript compile check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1
  ```

  Expected: no output.

- [ ] **Step 8: Build check**

  ```bash
  cd frontend && ng build 2>&1 | tail -10
  ```

  Expected: build succeeds with no errors.

- [ ] **Step 9: Commit**

  ```bash
  git add frontend/capacitor.config.ts frontend/.gitignore frontend/src/index.html frontend/src/styles.scss frontend/src/app/ibkr-auth-gate/ibkr-auth-gate.component.ts frontend/package.json frontend/package-lock.json
  git commit -m "feat: add Capacitor config, safe area CSS, and iOS-aware openLogin"
  ```

---

### Task 6: iOS scaffold + Pi nginx instructions

**Files:**
- No code files created — this is all terminal commands and one-time setup.

This task runs `npx cap add ios` and `npx cap sync ios` to generate the Xcode project, then documents the manual steps for Pi nginx setup and Xcode build.

- [ ] **Step 1: Build the Angular app (required before `cap sync`)**

  ```bash
  cd frontend && ng build --configuration production
  ```

  Expected: `dist/frontend/browser/` is created.

- [ ] **Step 2: Scaffold the iOS project**

  ```bash
  cd frontend && npx cap add ios
  ```

  Expected: `frontend/ios/` directory is created with an Xcode project inside. Output ends with something like `✔ Adding native xcode project in ios in 300ms`.

- [ ] **Step 3: Sync web assets into iOS project**

  ```bash
  cd frontend && npx cap sync ios
  ```

  Expected: assets copied, plugins installed. Output ends with `✔ Sync finished`.

- [ ] **Step 4: Verify `frontend/ios/` is gitignored**

  ```bash
  git status frontend/ios/ 2>&1
  ```

  Expected: either "nothing to commit" or the path is not listed in untracked files (it's ignored).

- [ ] **Step 5: Open in Xcode**

  ```bash
  cd frontend && npx cap open ios
  ```

  Xcode opens the project at `frontend/ios/App/App.xcworkspace`.

- [ ] **Step 6: Configure Xcode signing**

  In Xcode:
  1. Select the `App` target in the project navigator.
  2. Go to **Signing & Capabilities** tab.
  3. Check **Automatically manage signing**.
  4. Set **Team** to your personal Apple ID (sign in at Xcode → Settings → Accounts if needed).
  5. Confirm Bundle Identifier shows `com.strattonoakmont.app`.

- [ ] **Step 7: Build and install on iPhone**

  Connect your iPhone via USB. In Xcode:
  1. Select your iPhone as the run target (top toolbar).
  2. Press **Run** (▶) to build and install directly.
  3. On the iPhone, go to **Settings → General → VPN & Device Management** and trust your developer certificate.

  To create an `.ipa` for future installs without a cable:
  1. **Product → Archive**
  2. In the Organizer window: **Distribute App → Development → Export**
  3. Install the exported `.ipa` via Xcode Devices or Apple Configurator 2.

- [ ] **Step 8: Pi nginx setup (manual, one-time — run on the Raspberry Pi)**

  SSH into the Pi and run these commands once:

  **8a. Create nginx config for port 5002:**

  ```bash
  sudo tee /etc/nginx/sites-available/ibkr-gateway <<'EOF'
  server {
      listen 5002 ssl;
      server_name gsfawkes.duckdns.org;

      ssl_certificate     /etc/letsencrypt/live/gsfawkes.duckdns.org/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/gsfawkes.duckdns.org/privkey.pem;

      location / {
          proxy_pass https://127.0.0.1:5000/;
          proxy_ssl_verify off;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
      }
  }
  EOF
  ```

  **8b. Enable the site:**

  ```bash
  sudo ln -s /etc/nginx/sites-available/ibkr-gateway /etc/nginx/sites-enabled/ibkr-gateway
  sudo nginx -t && sudo nginx -s reload
  ```

  **8c. SSL cert note:**
  If `/etc/letsencrypt/live/gsfawkes.duckdns.org/` does not exist yet (the cert was obtained for port 5001 but may already cover this domain), run:
  ```bash
  sudo certbot certonly --nginx -d gsfawkes.duckdns.org
  ```
  Then re-run Step 8b.

  **8d. Router port forward:**
  In your router admin panel, add a port forward rule:
  - External port: `5002` (TCP)
  - Internal IP: your Pi's LAN IP (find it with `hostname -I`)
  - Internal port: `5002`

- [ ] **Step 9: Verify end-to-end on iPhone**

  1. Open the installed app on your iPhone.
  2. The dashboard should load (server mode, pointing at `gsfawkes.duckdns.org:5001`).
  3. To test the auth gate: stop the IBKR gateway on the Pi. Within 3 seconds (disconnected poll interval), the overlay should appear.
  4. Tap **Open IBKR Login**. An `SFSafariViewController` should open `https://gsfawkes.duckdns.org:5002`, showing the IBKR login page.
  5. Log in. The `SFSafariViewController` closes automatically (or tap Done). The overlay should dismiss within the next 3-second poll.

- [ ] **Step 10: Commit**

  ```bash
  # ios/ is gitignored — only commit any leftover untracked files (there shouldn't be any)
  git status
  git commit --allow-empty -m "feat: complete Capacitor iOS setup and Pi nginx documented"
  ```

  _(The `--allow-empty` is for cases where Step 9 produced no new tracked files. If `git status` shows nothing to commit, you can skip the commit entirely.)_
