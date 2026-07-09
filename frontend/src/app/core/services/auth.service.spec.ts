import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('starts unauthenticated with no stored token', () => {
    expect(service.isAuthenticated()).toBeFalse();
    expect(service.currentUser$.value).toBeNull();
  });

  it('stores the token and user on successful login', () => {
    service.login('trader@example.com', 'password123').subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    req.flush({ token: 'fake-token', user: { id: 'u1', email: 'trader@example.com', canEditConfig: true, canManualTrade: false } });

    expect(service.isAuthenticated()).toBeTrue();
    expect(service.token).toBe('fake-token');
    expect(service.currentUser$.value?.email).toBe('trader@example.com');
  });

  it('reports permissions from the current user', () => {
    service.login('trader@example.com', 'password123').subscribe();
    httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush({
      token: 'fake-token',
      user: { id: 'u1', email: 'trader@example.com', canEditConfig: true, canManualTrade: false },
    });
    expect(service.hasPermission('canEditConfig')).toBeTrue();
    expect(service.hasPermission('canManualTrade')).toBeFalse();
  });

  it('clears state on logout', () => {
    service.login('trader@example.com', 'password123').subscribe();
    httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush({
      token: 'fake-token',
      user: { id: 'u1', email: 'trader@example.com', canEditConfig: true, canManualTrade: false },
    });
    service.logout();
    expect(service.isAuthenticated()).toBeFalse();
    expect(service.currentUser$.value).toBeNull();
  });

  it('restoreSession clears an invalid stored token', () => {
    localStorage.setItem('auth_token', 'stale-token');
    service.restoreSession().subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
    req.flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    expect(service.isAuthenticated()).toBeFalse();
  });
});
