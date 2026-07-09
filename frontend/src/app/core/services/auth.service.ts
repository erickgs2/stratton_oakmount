import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { tap, map, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  id: string;
  email: string;
  canEditConfig: boolean;
  canManualTrade: boolean;
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser$ = new BehaviorSubject<AuthUser | null>(null);
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {
    const storedUser = localStorage.getItem(USER_KEY);
    if (storedUser && this.token) {
      this.currentUser$.next(JSON.parse(storedUser) as AuthUser);
    }
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  hasPermission(permission: 'canEditConfig' | 'canManualTrade'): boolean {
    return this.currentUser$.value?.[permission] ?? false;
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, { email, password }).pipe(
      tap(res => this.setSession(res.token, res.user)),
      map(res => res.user),
    );
  }

  restoreSession(): Observable<AuthUser | null> {
    if (!this.token) return of(null);
    return this.http.get<AuthUser>(`${this.apiUrl}/auth/me`).pipe(
      tap(user => this.currentUser$.next(user)),
      catchError(() => {
        this.clearSession();
        return of(null);
      }),
    );
  }

  logout(): void {
    this.clearSession();
  }

  private setSession(token: string, user: AuthUser): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUser$.next(user);
  }

  private clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser$.next(null);
  }
}
