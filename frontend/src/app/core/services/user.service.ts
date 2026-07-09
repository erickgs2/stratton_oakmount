import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ManagedUser } from '../models/user.model';

export interface CreateUserPayload {
  email: string;
  password: string;
  canEditConfig: boolean;
  canManualTrade: boolean;
}

export interface UpdateUserPayload {
  email?: string;
  canEditConfig?: boolean;
  canManualTrade?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(): Observable<ManagedUser[]> {
    return this.http.get<ManagedUser[]>(`${this.apiUrl}/users`);
  }

  create(payload: CreateUserPayload): Observable<ManagedUser> {
    return this.http.post<ManagedUser>(`${this.apiUrl}/users`, payload);
  }

  update(id: string, payload: UpdateUserPayload): Observable<ManagedUser> {
    return this.http.patch<ManagedUser>(`${this.apiUrl}/users/${id}`, payload);
  }

  resetPassword(id: string, password: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/users/${id}/reset-password`, { password });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/users/${id}`);
  }
}
