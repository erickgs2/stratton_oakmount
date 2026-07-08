import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Trade } from '../models/trade.model';
import { Market } from '../models/market.model';

export interface TradeFilters {
  market?: Market;
  symbol?: string;
  from?: string;
}

@Injectable({ providedIn: 'root' })
export class TradeService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getTrades(filters: TradeFilters = {}): Observable<Trade[]> {
    let params = new HttpParams();
    if (filters.market) params = params.set('market', filters.market);
    if (filters.symbol) params = params.set('symbol', filters.symbol);
    if (filters.from) params = params.set('from', filters.from);
    return this.http.get<Trade[]>(`${this.apiUrl}/trades`, { params });
  }
}
