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
