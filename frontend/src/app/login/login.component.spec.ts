import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../core/services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authServiceStub: { login: jasmine.Spy };
  let routerStub: { navigateByUrl: jasmine.Spy };

  beforeEach(async () => {
    authServiceStub = { login: jasmine.createSpy('login') };
    routerStub = { navigateByUrl: jasmine.createSpy('navigateByUrl') };

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: authServiceStub },
        { provide: Router, useValue: routerStub },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
  });

  it('navigates to /dashboard on successful login with no returnUrl', () => {
    authServiceStub.login.and.returnValue(of({ id: 'u1', email: 'a@b.com', canEditConfig: true, canManualTrade: false }));
    component.email = 'a@b.com';
    component.password = 'password123';
    component.submit();
    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('shows an error message on failed login', () => {
    authServiceStub.login.and.returnValue(throwError(() => ({ status: 401 })));
    component.email = 'a@b.com';
    component.password = 'wrong';
    component.submit();
    expect(component.errorMessage).toBe('Invalid email or password');
  });

  it('does not submit when the form is incomplete', () => {
    component.email = '';
    component.password = '';
    component.submit();
    expect(authServiceStub.login).not.toHaveBeenCalled();
  });
});
