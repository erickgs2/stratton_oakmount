import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PnlReport } from '../models/pnl.model';
import { Market } from '../models/market.model';

@Injectable({ providedIn: 'root' })
export class PnlService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getReport(market: Market): Observable<PnlReport> {
    const params = new HttpParams().set('market', market);
    return this.http.get<PnlReport>(`${this.apiUrl}/pnl`, { params });
  }
}
