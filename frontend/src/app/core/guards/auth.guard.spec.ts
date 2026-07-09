import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let authServiceStub: { isAuthenticated: jasmine.Spy; hasPermission: jasmine.Spy };
  let router: Router;

  beforeEach(() => {
    authServiceStub = {
      isAuthenticated: jasmine.createSpy('isAuthenticated'),
      hasPermission: jasmine.createSpy('hasPermission'),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authServiceStub }],
    });
    router = TestBed.inject(Router);
  });

  function run(routeData: Record<string, unknown> = {}) {
    return TestBed.runInInjectionContext(() =>
      authGuard(
        { data: routeData } as unknown as ActivatedRouteSnapshot,
        { url: '/bot-config' } as unknown as RouterStateSnapshot,
      ),
    );
  }

  it('redirects to /login when not authenticated', () => {
    authServiceStub.isAuthenticated.and.returnValue(false);
    const result = run() as UrlTree;
    expect(result.toString()).toContain('/login');
  });

  it('allows access when authenticated and no permission is required', () => {
    authServiceStub.isAuthenticated.and.returnValue(true);
    expect(run()).toBeTrue();
  });

  it('redirects to /dashboard when authenticated but missing a required permission', () => {
    authServiceStub.isAuthenticated.and.returnValue(true);
    authServiceStub.hasPermission.and.returnValue(false);
    const result = run({ requiresPermission: 'canEditConfig' }) as UrlTree;
    expect(result.toString()).toContain('/dashboard');
  });

  it('allows access when authenticated and the required permission is present', () => {
    authServiceStub.isAuthenticated.and.returnValue(true);
    authServiceStub.hasPermission.and.returnValue(true);
    expect(run({ requiresPermission: 'canEditConfig' })).toBeTrue();
  });
});
