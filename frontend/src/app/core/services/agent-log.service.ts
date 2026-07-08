import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AgentLog } from '../models/agent-log.model';
import { AgentRequestPreview } from '../models/agent-request-preview.model';
import { Market } from '../models/market.model';

@Injectable({ providedIn: 'root' })
export class AgentLogService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getLogs(market: Market, limit = 50): Observable<{ logs: AgentLog[] }> {
    const params = new HttpParams()
      .set('market', market)
      .set('limit', limit.toString());
    return this.http.get<{ logs: AgentLog[] }>(`${this.apiUrl}/agent/logs`, { params });
  }

  getRequestPreview(market: Market): Observable<AgentRequestPreview> {
    const params = new HttpParams().set('market', market);
    return this.http.get<AgentRequestPreview>(`${this.apiUrl}/agent/preview`, { params });
  }
}
