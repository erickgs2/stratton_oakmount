import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, startWith } from 'rxjs';
import { Portfolio } from '../models/portfolio.model';

@Injectable({ providedIn: 'root' })
export class PortfolioService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getPortfolio(): Observable<Portfolio> {
    return this.http.get<Portfolio>(`${this.apiUrl}/portfolio`);
  }

  pollPortfolio(intervalMs = 30_000): Observable<Portfolio> {
    return interval(intervalMs).pipe(
      startWith(0),
      switchMap(() => this.getPortfolio())
    );
  }
}
