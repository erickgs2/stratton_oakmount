import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { UserService } from './user.service';
import { environment } from '../../../environments/environment';

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists users', () => {
    service.list().subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('creates a user', () => {
    service.create({ email: 'a@b.com', password: 'longenough', canEditConfig: false, canManualTrade: true }).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('updates a user', () => {
    service.update('u1', { canEditConfig: false }).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/users/u1`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('resets a password', () => {
    service.resetPassword('u1', 'newlongpassword').subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/users/u1/reset-password`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('deletes a user', () => {
    service.delete('u1').subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/users/u1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });
});
