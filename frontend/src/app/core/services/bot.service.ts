import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BotConfig } from '../models/bot-config.model';

export interface StartBotPayload {
  market: 'MX' | 'USA';
  symbols: string[];
  capitalLimit: number;
  intervalMin: number;
}

@Injectable({ providedIn: 'root' })
export class BotService {
  private readonly apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getStatus(market?: 'MX' | 'USA'): Observable<BotConfig[]> {
    const url = market
      ? `${this.apiUrl}/bot/status?market=${market}`
      : `${this.apiUrl}/bot/status`;
    return this.http.get<BotConfig[]>(url);
  }

  startBot(payload: StartBotPayload): Observable<{ status: string; config: BotConfig }> {
    return this.http.post<{ status: string; config: BotConfig }>(
      `${this.apiUrl}/bot/start`,
      payload
    );
  }

  stopBot(market: 'MX' | 'USA'): Observable<{ status: string; market: string }> {
    return this.http.post<{ status: string; market: string }>(
      `${this.apiUrl}/bot/stop`,
      { market }
    );
  }
}
