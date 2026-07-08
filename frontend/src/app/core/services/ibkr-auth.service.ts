import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class IbkrAuthService implements OnDestroy {
  readonly connected$ = new BehaviorSubject<boolean>(true);
  // Modal visibility is now user-driven (toolbar Login button), not tied
  // directly to connected$ — the app stays usable while disconnected.
  readonly showLoginModal$ = new BehaviorSubject<boolean>(false);

  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly apiUrl = environment.apiUrl;
  private polling = false;

  constructor(private http: HttpClient) {}

  startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    this.tick();
  }

  openLoginModal(): void {
    this.showLoginModal$.next(true);
  }

  closeLoginModal(): void {
    this.showLoginModal$.next(false);
  }

  private tick(): void {
    this.http
      .get<{ connected: boolean }>(`${this.apiUrl}/ibkr-auth-status`)
      .pipe(catchError(() => of({ connected: false })))
      .subscribe(res => {
        this.connected$.next(res.connected);
        this.timeoutId = setTimeout(() => this.tick(), 60_000);
      });
  }

  ngOnDestroy(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.connected$.complete();
    this.showLoginModal$.complete();
  }
}
