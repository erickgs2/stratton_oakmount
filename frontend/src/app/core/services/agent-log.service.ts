import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AgentLog } from '../models/agent-log.model';

@Injectable({ providedIn: 'root' })
export class AgentLogService {
  private readonly apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getLogs(market: 'MX' | 'USA', limit = 50): Observable<{ logs: AgentLog[] }> {
    const params = new HttpParams()
      .set('market', market)
      .set('limit', limit.toString());
    return this.http.get<{ logs: AgentLog[] }>(`${this.apiUrl}/agent/logs`, { params });
  }
}
