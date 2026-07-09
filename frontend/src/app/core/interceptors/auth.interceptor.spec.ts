import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('attaches the bearer token to API requests when authenticated', () => {
    localStorage.setItem('auth_token', 'fake-token');
    http.get(`${environment.apiUrl}/bot/status`).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/bot/status`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
    req.flush({});
  });

  it('does not attach a header when there is no token', () => {
    localStorage.removeItem('auth_token');
    http.get(`${environment.apiUrl}/bot/status`).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/bot/status`);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('logs out on a 401 response from the API', () => {
    localStorage.setItem('auth_token', 'fake-token');
    const logoutSpy = spyOn(authService, 'logout');
    http.get(`${environment.apiUrl}/bot/status`).subscribe({ error: () => {} });
    const req = httpMock.expectOne(`${environment.apiUrl}/bot/status`);
    req.flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    expect(logoutSpy).toHaveBeenCalled();
  });
});
