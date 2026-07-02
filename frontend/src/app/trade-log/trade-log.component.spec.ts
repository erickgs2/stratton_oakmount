import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TradeLogComponent } from './trade-log.component';
import { TradeService } from '../core/services/trade.service';
import { Trade } from '../core/models/trade.model';

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: '1',
    createdAt: '2026-07-02T10:00:00.000Z',
    symbol: 'AMXL',
    market: 'MX',
    action: 'buy',
    quantity: 10,
    price: 22.5,
    currency: 'MXN',
    reason: 'test',
    ...overrides,
  };
}

describe('TradeLogComponent', () => {
  let component: TradeLogComponent;
  let fixture: ComponentFixture<TradeLogComponent>;
  let tradeServiceStub: { getTrades: jasmine.Spy };

  beforeEach(async () => {
    tradeServiceStub = { getTrades: jasmine.createSpy('getTrades').and.returnValue(of([])) };

    await TestBed.configureTestingModule({
      imports: [TradeLogComponent],
      providers: [{ provide: TradeService, useValue: tradeServiceStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(TradeLogComponent);
    component = fixture.componentInstance;
  });

  it('shows a zero-state message when there are no trades', () => {
    component.trades = [];
    expect(component.tradeCountLabel).toBe('No trades yet');
  });

  it('uses singular phrasing for exactly one trade', () => {
    component.trades = [makeTrade()];
    expect(component.tradeCountLabel).toBe("That's everything so far — 1 trade executed");
  });

  it('uses plural phrasing for more than one trade', () => {
    component.trades = [makeTrade({ id: '1' }), makeTrade({ id: '2' })];
    expect(component.tradeCountLabel).toBe("That's everything so far — 2 trades executed");
  });
});
