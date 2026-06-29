import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BotLog } from '../models/bot-log.model';

@Injectable({ providedIn: 'root' })
export class BotLogService {
  private readonly apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getLogs(params: { market?: 'MX' | 'USA'; level?: 'info' | 'warn' | 'error'; limit?: number } = {}): Observable<{ logs: BotLog[] }> {
    let httpParams = new HttpParams();
    if (params.market) httpParams = httpParams.set('market', params.market);
    if (params.level) httpParams = httpParams.set('level', params.level);
    if (params.limit != null) httpParams = httpParams.set('limit', params.limit.toString());
    return this.http.get<{ logs: BotLog[] }>(`${this.apiUrl}/bot/logs`, { params: httpParams });
  }
}
