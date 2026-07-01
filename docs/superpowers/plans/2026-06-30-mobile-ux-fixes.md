# Mobile UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the iOS status-bar margin overlap, add pull-to-refresh and edge-swipe-to-open-menu gestures on every page, and replace the app icon with the lion-on-globe mark.

**Architecture:** A single shared `MobileGestureDirective` attached once to the app shell's scrollable container (`mat-sidenav-content`) classifies touch gestures (vertical-from-top → pull-to-refresh, horizontal-from-left-edge → menu-swipe) and emits events that `AppComponent` handles — so both gestures work on every page with no per-page code. The safe-area fix strengthens existing CSS. The icon is regenerated from the provided reference image into the (gitignored, locally-built) Xcode asset catalog.

**Tech Stack:** Angular 17 standalone components/directives, Angular Material, Karma/Jasmine, Python 3 + Pillow (one-time icon generation, dev-machine only).

## Global Constraints

- All code, naming, and docs in English.
- TypeScript strict mode throughout.
- No new npm dependencies — gestures are implemented with plain DOM touch events, not a library or native Capacitor plugin (avoids requiring an Xcode rebuild to iterate).
- `frontend/ios/` is gitignored (Xcode-generated) — icon changes only take effect after the user's next `npx cap sync ios` + Xcode rebuild, not via the web deploy pipeline.
- Production only auto-deploys on push to `main` (`.github/workflows/deploy.yml` triggers on `push: branches: [main]`). Work on this plan should land on `qa` per the branch's normal workflow and will need to reach `main` before it's visible on `gsfawkes.duckdns.org:5001`.
- Pre-existing, unrelated issue: `frontend/src/app/app.component.spec.ts` currently fails all 3 tests (`NullInjectorError: No provider for HttpClient`) because `IbkrAuthService` requires `HttpClient` and the spec's `TestBed` doesn't provide it. This is out of scope for this plan — do not fix it. New tests in this plan avoid `TestBed`-instantiating `AppComponent` entirely (see Task 1 and Task 2) so they aren't affected by it.

---

### Task 1: Safe-area top margin fix

**Files:**
- Modify: `frontend/src/styles.scss:31-45` (the existing `--sat`/`--sab`/`.app-toolbar` block)
- Test: `frontend/src/styles.spec.ts` (new)

**Interfaces:** None — pure CSS, no other task depends on this one.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/styles.spec.ts`:

```typescript
describe('app-toolbar safe-area styling', () => {
  it('applies at least a 32px top padding floor regardless of env(safe-area-inset-top)', () => {
    const el = document.createElement('div');
    el.className = 'app-toolbar';
    document.body.appendChild(el);

    const paddingTop = getComputedStyle(el).paddingTop;

    document.body.removeChild(el);
    expect(paddingTop).toBe('32px');
  });
});
```

This runs directly under Karma without Angular's `TestBed` — `frontend/src/styles.scss` is loaded globally for every spec via `angular.json`'s `test` builder (`"styles": ["src/styles.scss"]`), and Karma's default headless Chrome browser correctly evaluates `env()`/`max()` (returning `0` for the unset safe-area env var in this non-notched, non-standalone test context), so the padding value is deterministic.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/styles.spec.ts'`
Expected: FAIL — actual `paddingTop` is `0px` (current CSS has no floor, and `env(safe-area-inset-top)` evaluates to `0` in headless Chrome).

- [ ] **Step 3: Write minimal implementation**

Replace in `frontend/src/styles.scss`:

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
```

with:

```scss
// iOS safe area — notch / Dynamic Island / home indicator.
// max(..., 20px) guards against env(safe-area-inset-top) reporting 0 in
// contexts where it's unreliable (e.g. mobile Safari with chrome
// auto-hidden, rather than a true standalone/native container); the
// extra 12px gives breathing room instead of a flush edge-to-edge fit.
html {
  --sat: max(env(safe-area-inset-top), 20px);
  --sab: env(safe-area-inset-bottom);
}

.app-toolbar {
  padding-top: calc(var(--sat) + 12px);
  height: calc(56px + var(--sat) + 12px) !important;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/styles.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles.scss frontend/src/styles.spec.ts
git commit -m "fix: strengthen iOS safe-area top margin with a floor and breathing room"
```

---

### Task 2: Shared mobile gesture directive (pull-to-refresh + edge-swipe)

**Files:**
- Create: `frontend/src/app/shared/mobile-gesture.directive.ts`
- Test: `frontend/src/app/shared/mobile-gesture.directive.spec.ts`

**Interfaces:**
- Produces: `MobileGestureDirective` — standalone directive, selector `[appMobileGestures]`.
  - `@Output() pullChange: EventEmitter<number>` — emits the current pull distance in px (`0` to `90`) while a vertical pull-from-top gesture is in progress, and `0` on release if the gesture didn't cross the refresh threshold.
  - `@Output() refresh: EventEmitter<void>` — emits once when a pull gesture is released past the refresh threshold.
  - `@Output() swipeOpen: EventEmitter<void>` — emits once when a horizontal drag starting within the left edge zone is released past the swipe threshold.
  - Applies to any host element; uses the host's own `scrollTop` to detect "at top of scroll" for the pull gesture, and the host's viewport-relative touch `clientX` for the edge-zone check — so it must be applied to the actual scrollable container.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/shared/mobile-gesture.directive.spec.ts`:

```typescript
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MobileGestureDirective } from './mobile-gesture.directive';

@Component({
  standalone: true,
  imports: [MobileGestureDirective],
  template: `
    <div
      appMobileGestures
      style="height: 400px; overflow: auto;"
      (pullChange)="pullValues.push($event)"
      (refresh)="refreshCount = refreshCount + 1"
      (swipeOpen)="swipeOpenCount = swipeOpenCount + 1"
    ></div>
  `,
})
class HostComponent {
  pullValues: number[] = [];
  refreshCount = 0;
  swipeOpenCount = 0;
}

function touch(target: EventTarget, x: number, y: number): Touch {
  return new Touch({ identifier: 0, target, clientX: x, clientY: y });
}

function dispatchTouch(el: HTMLElement, type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number): void {
  const t = touch(el, x, y);
  const event = new TouchEvent(type, {
    touches: type === 'touchend' ? [] : [t],
    changedTouches: [t],
    cancelable: true,
    bubbles: true,
  });
  el.dispatchEvent(event);
}

describe('MobileGestureDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    el = fixture.nativeElement.querySelector('div');
  });

  it('emits refresh when pulled straight down past the threshold', () => {
    dispatchTouch(el, 'touchstart', 100, 50);
    dispatchTouch(el, 'touchmove', 100, 250);
    dispatchTouch(el, 'touchend', 100, 250);

    expect(fixture.componentInstance.refreshCount).toBe(1);
  });

  it('does not emit refresh when pulled down but released before the threshold', () => {
    dispatchTouch(el, 'touchstart', 100, 50);
    dispatchTouch(el, 'touchmove', 100, 80);
    dispatchTouch(el, 'touchend', 100, 80);

    expect(fixture.componentInstance.refreshCount).toBe(0);
    expect(fixture.componentInstance.pullValues).toContain(0);
  });

  it('emits swipeOpen when dragged right from the left edge past the threshold', () => {
    dispatchTouch(el, 'touchstart', 10, 100);
    dispatchTouch(el, 'touchmove', 80, 100);
    dispatchTouch(el, 'touchend', 80, 100);

    expect(fixture.componentInstance.swipeOpenCount).toBe(1);
  });

  it('does not emit swipeOpen for a horizontal drag that does not start near the edge', () => {
    dispatchTouch(el, 'touchstart', 100, 100);
    dispatchTouch(el, 'touchmove', 170, 100);
    dispatchTouch(el, 'touchend', 170, 100);

    expect(fixture.componentInstance.swipeOpenCount).toBe(0);
    expect(fixture.componentInstance.refreshCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/mobile-gesture.directive.spec.ts'`
Expected: FAIL — `mobile-gesture.directive.ts` does not exist yet (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/app/shared/mobile-gesture.directive.ts`:

```typescript
import { Directive, ElementRef, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';

const EDGE_ZONE_PX = 24;
const DEAD_ZONE_PX = 8;
const PULL_THRESHOLD_PX = 70;
const MAX_PULL_PX = 90;
const PULL_RESISTANCE = 0.5;
const SWIPE_THRESHOLD_PX = 50;

type GestureMode = 'idle' | 'classifying' | 'pull' | 'swipe' | 'ignore';

@Directive({
  selector: '[appMobileGestures]',
  standalone: true,
})
export class MobileGestureDirective implements OnInit, OnDestroy {
  @Output() pullChange = new EventEmitter<number>();
  @Output() refresh = new EventEmitter<void>();
  @Output() swipeOpen = new EventEmitter<void>();

  private mode: GestureMode = 'idle';
  private startX = 0;
  private startY = 0;

  constructor(private readonly el: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    const host = this.el.nativeElement;
    host.addEventListener('touchstart', this.onTouchStart, { passive: true });
    host.addEventListener('touchmove', this.onTouchMove, { passive: false });
    host.addEventListener('touchend', this.onTouchEnd, { passive: true });
  }

  ngOnDestroy(): void {
    const host = this.el.nativeElement;
    host.removeEventListener('touchstart', this.onTouchStart);
    host.removeEventListener('touchmove', this.onTouchMove);
    host.removeEventListener('touchend', this.onTouchEnd);
  }

  private readonly onTouchStart = (e: TouchEvent): void => {
    const t = e.touches[0];
    this.startX = t.clientX;
    this.startY = t.clientY;
    this.mode = 'classifying';
  };

  private readonly onTouchMove = (e: TouchEvent): void => {
    if (this.mode === 'idle' || this.mode === 'ignore') return;

    const t = e.touches[0];
    const dx = t.clientX - this.startX;
    const dy = t.clientY - this.startY;

    if (this.mode === 'classifying') {
      if (Math.abs(dx) < DEAD_ZONE_PX && Math.abs(dy) < DEAD_ZONE_PX) return;

      const atScrollTop = this.el.nativeElement.scrollTop === 0;
      const nearLeftEdge = this.startX <= EDGE_ZONE_PX;

      if (Math.abs(dy) > Math.abs(dx) && dy > 0 && atScrollTop) {
        this.mode = 'pull';
      } else if (Math.abs(dx) > Math.abs(dy) && dx > 0 && nearLeftEdge) {
        this.mode = 'swipe';
      } else {
        this.mode = 'ignore';
        return;
      }
    }

    if (this.mode === 'pull') {
      e.preventDefault();
      const pull = Math.min(Math.max(dy, 0) * PULL_RESISTANCE, MAX_PULL_PX);
      this.pullChange.emit(pull);
    }
  };

  private readonly onTouchEnd = (e: TouchEvent): void => {
    const t = e.changedTouches[0];
    const dx = t.clientX - this.startX;
    const dy = t.clientY - this.startY;

    if (this.mode === 'pull') {
      const pull = Math.min(Math.max(dy, 0) * PULL_RESISTANCE, MAX_PULL_PX);
      if (pull >= PULL_THRESHOLD_PX) {
        this.refresh.emit();
      } else {
        this.pullChange.emit(0);
      }
    } else if (this.mode === 'swipe') {
      if (dx >= SWIPE_THRESHOLD_PX) {
        this.swipeOpen.emit();
      }
    }

    this.mode = 'idle';
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/mobile-gesture.directive.spec.ts'`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/mobile-gesture.directive.ts frontend/src/app/shared/mobile-gesture.directive.spec.ts
git commit -m "feat: add shared touch-gesture directive for pull-to-refresh and edge-swipe"
```

---

### Task 3: Wire gestures + pull indicator into the app shell

**Files:**
- Modify: `frontend/src/app/app.component.ts`
- Modify: `frontend/src/app/app.component.html`
- Modify: `frontend/src/app/app.component.scss`

**Interfaces:**
- Consumes: `MobileGestureDirective` from Task 2 (`pullChange`, `refresh`, `swipeOpen` outputs), selector `[appMobileGestures]`.
- Produces: nothing consumed by later tasks in this plan.

**Note:** `app.component.spec.ts` cannot currently be exercised via `TestBed` (see Global Constraints — pre-existing, unrelated `HttpClient` DI failure). This task's correctness is verified manually via the dev server per step 5, not via an automated `AppComponent` test.

- [ ] **Step 1: Add gesture state and handlers to `AppComponent`**

In `frontend/src/app/app.component.ts`, add the import and update the class:

```typescript
import { MobileGestureDirective } from './shared/mobile-gesture.directive';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
```

Add `MobileGestureDirective` and `MatProgressSpinnerModule` to the `imports` array in the `@Component` decorator (alongside the existing `MatIconModule`, etc.).

Add to the `AppComponent` class body (alongside the existing `isMobile` field):

```typescript
  pullDistance = 0;
  readonly pullThreshold = 70;

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
```

- [ ] **Step 2: Update the template**

In `frontend/src/app/app.component.html`, replace:

```html
  <mat-sidenav-content class="app-content">
    <mat-toolbar class="app-toolbar">
```

with:

```html
  <mat-sidenav-content
    class="app-content"
    appMobileGestures
    (pullChange)="onPullChange($event)"
    (refresh)="onRefresh()"
    (swipeOpen)="onSwipeOpen()">
    <div class="pull-refresh-indicator" [class.visible]="pullDistance > 0">
      <mat-progress-spinner *ngIf="pullDistance >= pullThreshold" diameter="24" mode="indeterminate" />
      <mat-icon *ngIf="pullDistance < pullThreshold" [style.transform]="'rotate(' + (pullDistance / pullThreshold * 180) + 'deg)'">arrow_downward</mat-icon>
    </div>
    <mat-toolbar class="app-toolbar">
```

(The rest of the template — toolbar contents, `.page-content`, closing tags — is unchanged.)

- [ ] **Step 3: Style the indicator**

Add to `frontend/src/app/app.component.scss`:

```scss
.pull-refresh-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translateY(-100%);
  transition: transform 0.15s ease-out;
  z-index: 50;
  color: var(--accent);
  pointer-events: none;

  &.visible {
    transform: translateY(0);
  }

  mat-icon {
    transition: transform 0.1s linear;
  }
}
```

Also add `position: relative;` to the existing `.app-content` rule so the indicator's `position: absolute` is relative to it.

- [ ] **Step 4: Build to catch compile errors**

Run: `cd frontend && npx ng build`
Expected: builds with no TypeScript or template errors.

- [ ] **Step 5: Manually verify in the dev server**

Run: `cd frontend && npx ng serve`, open `http://localhost:4200` in a browser with mobile device emulation (Chrome DevTools → toggle device toolbar → any iPhone preset). Confirm:
- Pulling down from the top of the page shows the indicator and reloads the page once past ~70px.
- Swiping right from the very left edge of the screen opens the hamburger menu.
- Normal vertical scrolling of page content still works and is not hijacked by the gesture directive.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/app.component.ts frontend/src/app/app.component.html frontend/src/app/app.component.scss
git commit -m "feat: wire pull-to-refresh and edge-swipe-to-open-menu into the app shell"
```

---

### Task 4: Replace the app icon

**Files:**
- Create: `frontend/src/assets/branding/lion-globe-mark.png` (source artwork, committed)
- Create: `frontend/scripts/generate-app-icon.py`
- Modify (generated, not hand-edited): `frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`

**Interfaces:** None — standalone asset task, no other task depends on it.

**Prerequisite:** Python 3 with Pillow installed (`pip3 install --user Pillow`) on the machine running this step — this is a one-time local image-processing tool, not a project runtime dependency, so it is not added to any `package.json`.

- [ ] **Step 1: Add the source artwork**

Copy the reference lion-on-globe image into the repo:

```bash
mkdir -p frontend/src/assets/branding
cp /Users/egarsev/.claude/image-cache/a1b6049b-1baf-416d-8905-c6130d8a8402/2.png frontend/src/assets/branding/lion-globe-mark.png
```

- [ ] **Step 2: Write the icon generation script**

Create `frontend/scripts/generate-app-icon.py`:

```python
#!/usr/bin/env python3
"""Generate the iOS AppIcon PNG from the source brand mark.

Usage: python3 generate-app-icon.py

Crops the source image tightly around its non-white content, pads it to a
square with a small white margin, and scales it to the 1024x1024 size Xcode
expects for the single-entry AppIcon.appiconset used by this project.
"""
import os
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(SCRIPT_DIR, '..', 'src', 'assets', 'branding', 'lion-globe-mark.png')
DEST = os.path.join(
    SCRIPT_DIR, '..', 'ios', 'App', 'App', 'Assets.xcassets',
    'AppIcon.appiconset', 'AppIcon-512@2x.png',
)
ICON_SIZE = 1024
MARGIN_FRACTION = 0.03
CONTENT_THRESHOLD = 230  # grayscale value below which a pixel counts as "content"

def main() -> None:
    im = Image.open(SOURCE).convert('RGB')
    gray = im.convert('L')
    mask = gray.point(lambda p: 255 if p < CONTENT_THRESHOLD else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise SystemExit(f'No content found in {SOURCE}')

    content = im.crop(bbox)
    w, h = content.size
    pad = int(max(w, h) * MARGIN_FRACTION)
    side = max(w, h) + pad * 2

    canvas = Image.new('RGB', (side, side), (255, 255, 255))
    canvas.paste(content, ((side - w) // 2, (side - h) // 2))

    icon = canvas.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    icon.save(DEST)
    print(f'Wrote {DEST} ({ICON_SIZE}x{ICON_SIZE})')

if __name__ == '__main__':
    main()
```

- [ ] **Step 3: Run the script**

Run: `cd frontend && python3 scripts/generate-app-icon.py`
Expected output: `Wrote .../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png (1024x1024)`

(If `frontend/ios/` doesn't exist yet in the current checkout because `npx cap add ios` hasn't been run — see the pending manual step from PR #3 — run `npx cap add ios` first so the `Assets.xcassets` directory exists, then re-run the script.)

- [ ] **Step 4: Verify the generated icon**

Run: `sips -g pixelWidth -g pixelHeight -g hasAlpha frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
Expected: `pixelWidth: 1024`, `pixelHeight: 1024`, `hasAlpha: no` (App Store icons must not have an alpha channel — the script flattens onto white via `Image.new('RGB', ...)`, which drops alpha).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/assets/branding/lion-globe-mark.png frontend/scripts/generate-app-icon.py
git commit -m "feat: replace app icon with lion-on-globe brand mark"
```

Note: `frontend/ios/` itself is gitignored, so the generated `AppIcon-512@2x.png` is not committed — regenerating it (Step 3) after any fresh `npx cap add ios` is a normal part of the existing manual Xcode setup flow from PR #3. The icon will only appear on the physical device after the next Xcode build/install.

---

## Self-Review Notes

- **Spec coverage:** Safe-area margin (Task 1), pull-to-refresh on every page (Tasks 2–3, applied once at the shell level), edge-swipe menu on every page (Tasks 2–3), app icon (Task 4). All four spec sections have a task.
- **Type consistency:** `MobileGestureDirective`'s outputs (`pullChange: EventEmitter<number>`, `refresh: EventEmitter<void>`, `swipeOpen: EventEmitter<void>`) are defined in Task 2 and consumed with matching names/types in Task 3's template bindings.
- **No placeholders:** all steps contain complete, runnable code.
