import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BotLog } from '../models/bot-log.model';
import { Market } from '../models/market.model';

@Injectable({ providedIn: 'root' })
export class BotLogService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getLogs(params: { market?: Market; level?: 'info' | 'warn' | 'error'; limit?: number } = {}): Observable<{ logs: BotLog[] }> {
    let httpParams = new HttpParams();
    if (params.market) httpParams = httpParams.set('market', params.market);
    if (params.level) httpParams = httpParams.set('level', params.level);
    if (params.limit != null) httpParams = httpParams.set('limit', params.limit.toString());
    return this.http.get<{ logs: BotLog[] }>(`${this.apiUrl}/bot/logs`, { params: httpParams });
  }
}
