import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ManualTradeService } from './manual-trade.service';
import { environment } from '../../../environments/environment';

describe('ManualTradeService', () => {
  let service: ManualTradeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ManualTradeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('posts a stock trade request', () => {
    service.execute({ market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 10 }).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/trades/manual`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 10 });
    req.flush({ trade: { id: 't1', quantity: 10, price: 20 } });
  });

  it('posts a crypto trade request', () => {
    service.execute({ market: 'CRYPTO', symbol: 'btc_mxn', side: 'sell', mxnAmount: 500 }).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/trades/manual`);
    expect(req.request.body).toEqual({ market: 'CRYPTO', symbol: 'btc_mxn', side: 'sell', mxnAmount: 500 });
    req.flush({ trade: { id: 't2', quantity: 0.001, price: 500000 } });
  });
});
