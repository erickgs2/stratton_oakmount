import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MXMarketData } from '../models/market-data.model';

@Injectable({ providedIn: 'root' })
export class MarketDataService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getMXData(symbol: string): Observable<MXMarketData> {
    const params = new HttpParams().set('symbol', symbol);
    return this.http.get<MXMarketData>(`${this.apiUrl}/market-data/mx`, { params });
  }

  getUSAData(symbol: string): Observable<MXMarketData> {
    const params = new HttpParams().set('symbol', symbol);
    return this.http.get<MXMarketData>(`${this.apiUrl}/market-data/usa`, { params });
  }

  getCryptoData(symbol: string): Observable<MXMarketData> {
    const params = new HttpParams().set('symbol', symbol);
    return this.http.get<MXMarketData>(`${this.apiUrl}/market-data/crypto`, { params });
  }
}
