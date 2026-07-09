import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of } from 'rxjs';
import { AppComponent } from './app.component';
import { IbkrAuthService } from './core/services/ibkr-auth.service';
import { AuthService, AuthUser } from './core/services/auth.service';

describe('AppComponent', () => {
  let ibkrAuthServiceStub: { connected$: Observable<boolean>; startPolling: jasmine.Spy; openLoginModal: jasmine.Spy };
  let authServiceStub: { currentUser$: Observable<AuthUser | null>; hasPermission: jasmine.Spy; restoreSession: jasmine.Spy; logout: jasmine.Spy };

  function configure(canEditConfig: boolean): void {
    ibkrAuthServiceStub = {
      connected$: of(false),
      startPolling: jasmine.createSpy('startPolling'),
      openLoginModal: jasmine.createSpy('openLoginModal'),
    };
    authServiceStub = {
      currentUser$: of(null),
      hasPermission: jasmine.createSpy('hasPermission').and.returnValue(canEditConfig),
      restoreSession: jasmine.createSpy('restoreSession').and.returnValue(of(null)),
      logout: jasmine.createSpy('logout'),
    };

    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: false }) } },
        { provide: IbkrAuthService, useValue: ibkrAuthServiceStub },
        { provide: AuthService, useValue: authServiceStub },
      ],
    });
  }

  it('should create the app', async () => {
    configure(true);
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('hides the Bot Config nav link when the user lacks canEditConfig', async () => {
    configure(false);
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const botConfigLink = fixture.nativeElement.querySelector('a[routerLink="/bot-config"]');
    expect(botConfigLink).toBeNull();
  });

  it('shows the Bot Config nav link when the user has canEditConfig', async () => {
    configure(true);
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const botConfigLink = fixture.nativeElement.querySelector('a[routerLink="/bot-config"]');
    expect(botConfigLink).not.toBeNull();
  });
});
