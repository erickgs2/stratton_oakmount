import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ManualTradeDialogComponent, ManualTradeDialogData } from './manual-trade-dialog.component';
import { ManualTradeService } from '../core/services/manual-trade.service';
import { MarketDataService } from '../core/services/market-data.service';

describe('ManualTradeDialogComponent', () => {
  let component: ManualTradeDialogComponent;
  let fixture: ComponentFixture<ManualTradeDialogComponent>;
  let dialogRefStub: { close: jasmine.Spy };
  let manualTradeServiceStub: { execute: jasmine.Spy };
  let marketDataServiceStub: { getMXData: jasmine.Spy; getUSAData: jasmine.Spy; getCryptoData: jasmine.Spy };

  function setup(data: ManualTradeDialogData): void {
    dialogRefStub = { close: jasmine.createSpy('close') };
    manualTradeServiceStub = { execute: jasmine.createSpy('execute') };
    marketDataServiceStub = {
      getMXData: jasmine.createSpy('getMXData').and.returnValue(of({ symbol: 'AMXL', lastPrice: 20, changePct: 0, volume: 0, history: [] })),
      getUSAData: jasmine.createSpy('getUSAData').and.returnValue(of({ symbol: 'AAPL', lastPrice: 100, changePct: 0, volume: 0, history: [] })),
      getCryptoData: jasmine.createSpy('getCryptoData').and.returnValue(of({ symbol: 'btc_mxn', lastPrice: 1000000, changePct: 0, volume: 0, history: [] })),
    };

    TestBed.configureTestingModule({
      imports: [ManualTradeDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: dialogRefStub },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: ManualTradeService, useValue: manualTradeServiceStub },
        { provide: MarketDataService, useValue: marketDataServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManualTradeDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('defaults to the first eligible symbol for the market and fetches its price', () => {
    setup({ market: 'MX', availableFunds: 10000, heldQuantities: {} });
    expect(component.symbol).toBe('AMXL');
    expect(marketDataServiceStub.getMXData).toHaveBeenCalledWith('AMXL');
    expect(component.livePrice).toBe(20);
  });

  it('uses the crypto market-data endpoint for a CRYPTO dialog', () => {
    setup({ market: 'CRYPTO', availableFunds: 5000, heldQuantities: {} });
    expect(component.symbol).toBe('btc_mxn');
    expect(marketDataServiceStub.getCryptoData).toHaveBeenCalledWith('btc_mxn');
  });

  it('moves to the confirm step with a valid MX/USA quantity', () => {
    setup({ market: 'MX', availableFunds: 10000, heldQuantities: {} });
    component.quantity = 5;
    component.reviewOrder();
    expect(component.step).toBe('confirm');
    expect(component.errorMessage).toBe('');
  });

  it('rejects reviewing an MX/USA order with no quantity entered', () => {
    setup({ market: 'MX', availableFunds: 10000, heldQuantities: {} });
    component.quantity = null;
    component.reviewOrder();
    expect(component.step).toBe('form');
    expect(component.errorMessage).not.toBe('');
  });

  it('moves to the confirm step with a valid CRYPTO amount', () => {
    setup({ market: 'CRYPTO', availableFunds: 5000, heldQuantities: {} });
    component.mxnAmount = 500;
    component.reviewOrder();
    expect(component.step).toBe('confirm');
  });

  it('confirmOrder calls the service and closes the dialog with true on success', () => {
    setup({ market: 'MX', availableFunds: 10000, heldQuantities: {} });
    manualTradeServiceStub.execute.and.returnValue(of({ trade: { id: 't1', quantity: 5, price: 20 } }));
    component.quantity = 5;
    component.reviewOrder();
    component.confirmOrder();
    expect(manualTradeServiceStub.execute).toHaveBeenCalledWith({ market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 5 });
    expect(dialogRefStub.close).toHaveBeenCalledWith(true);
  });

  it('confirmOrder surfaces a backend error and stays on the confirm step', () => {
    setup({ market: 'MX', availableFunds: 10000, heldQuantities: {} });
    manualTradeServiceStub.execute.and.returnValue(throwError(() => ({ error: { error: 'MX market is closed' } })));
    component.quantity = 5;
    component.reviewOrder();
    component.confirmOrder();
    expect(component.errorMessage).toBe('MX market is closed');
    expect(component.step).toBe('confirm');
    expect(dialogRefStub.close).not.toHaveBeenCalled();
  });

  it('back() returns to the form step', () => {
    setup({ market: 'MX', availableFunds: 10000, heldQuantities: {} });
    component.quantity = 5;
    component.reviewOrder();
    component.back();
    expect(component.step).toBe('form');
  });
});
