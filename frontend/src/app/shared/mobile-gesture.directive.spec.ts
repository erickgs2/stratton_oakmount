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
