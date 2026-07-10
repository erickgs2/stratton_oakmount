import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Market } from '../models/market.model';
import { Trade } from '../models/trade.model';

export interface ManualTradeRequest {
  market: Market;
  symbol: string;
  side: 'buy' | 'sell';
  quantity?: number;
  mxnAmount?: number;
}

@Injectable({ providedIn: 'root' })
export class ManualTradeService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  execute(request: ManualTradeRequest): Observable<{ trade: Trade }> {
    return this.http.post<{ trade: Trade }>(`${this.apiUrl}/trades/manual`, request);
  }
}
