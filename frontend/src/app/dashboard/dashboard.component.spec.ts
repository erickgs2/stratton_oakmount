import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { PortfolioService } from '../core/services/portfolio.service';
import { BotService } from '../core/services/bot.service';
import { OrderService } from '../core/services/order.service';
import { PnlService } from '../core/services/pnl.service';
import { CryptoPortfolioService } from '../core/services/crypto-portfolio.service';
import { AuthService } from '../core/services/auth.service';

describe('DashboardComponent — Manual Trade button', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let authServiceStub: { hasPermission: jasmine.Spy };

  function setup(canManualTrade: boolean): void {
    authServiceStub = { hasPermission: jasmine.createSpy('hasPermission').and.returnValue(canManualTrade) };

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideNoopAnimations(),
        { provide: PortfolioService, useValue: { getPortfolio: () => of({ positions: [], summary: { availableFunds: 0, buyingPower: 0, currency: 'USD', totalCashValue: 0, netLiquidation: 0 } }) } },
        { provide: BotService, useValue: { getStatus: () => of({ configs: [], markets: { MX: false, USA: false, CRYPTO: false } }) } },
        { provide: OrderService, useValue: { getPendingOrders: () => of([]) } },
        { provide: PnlService, useValue: { getReport: () => of(null) } },
        { provide: CryptoPortfolioService, useValue: { getPortfolio: () => of({ currency: 'MXN', availableFunds: 0, netLiquidation: 0, positions: [] }) } },
        { provide: AuthService, useValue: authServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  }

  it('hides the Manual Trade button without canManualTrade', () => {
    setup(false);
    const btn = fixture.nativeElement.querySelector('.manual-trade-btn');
    expect(btn).toBeNull();
  });

  it('shows the Manual Trade button with canManualTrade', () => {
    setup(true);
    const btn = fixture.nativeElement.querySelector('.manual-trade-btn');
    expect(btn).not.toBeNull();
  });
});
