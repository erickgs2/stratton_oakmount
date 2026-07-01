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
