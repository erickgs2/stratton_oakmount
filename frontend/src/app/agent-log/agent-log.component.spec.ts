import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { AgentLogComponent } from './agent-log.component';
import { AgentLogService } from '../core/services/agent-log.service';
import { AgentLog } from '../core/models/agent-log.model';

function makeLog(id: string, overrides: Partial<AgentLog> = {}): AgentLog {
  return {
    id,
    createdAt: '2026-07-02T10:00:00.000Z',
    symbol: 'AMXL',
    market: 'MX',
    executed: false,
    marketData: { lastPrice: 22.5, changePct: 0.5, volume: 1000, indicators: { rsi14: 50, ma20: 22, ma50: 21, percentChange5d: 1, volumeRatio: 1 } },
    response: { action: 'hold', quantity: 0, confidence: 0.5, reason: 'test' },
    ...overrides,
  };
}

describe('AgentLogComponent', () => {
  let component: AgentLogComponent;
  let fixture: ComponentFixture<AgentLogComponent>;
  let agentLogServiceStub: { getLogs: jasmine.Spy };

  beforeEach(async () => {
    agentLogServiceStub = { getLogs: jasmine.createSpy('getLogs').and.returnValue(of({ logs: [] })) };

    await TestBed.configureTestingModule({
      imports: [AgentLogComponent],
      providers: [
        { provide: AgentLogService, useValue: agentLogServiceStub },
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: false }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentLogComponent);
    component = fixture.componentInstance;
  });

  it('returns null when there are no logs', () => {
    component.logs = [];
    expect(component.selectedLog).toBeNull();
  });

  it('defaults to the first log when nothing is explicitly selected', () => {
    component.logs = [makeLog('a'), makeLog('b')];
    expect(component.selectedLog?.id).toBe('a');
  });

  it('returns the explicitly selected log when it exists in the filtered list', () => {
    component.logs = [makeLog('a'), makeLog('b')];
    component.selectLog('b');
    expect(component.selectedLog?.id).toBe('b');
  });

  it('falls back to the first visible log when the selected one is filtered out', () => {
    component.logs = [
      makeLog('a', { response: { action: 'hold', quantity: 0, confidence: 0.5, reason: 'x' } }),
      makeLog('b', { response: { action: 'buy', quantity: 5, confidence: 0.8, reason: 'y' } }),
    ];
    component.selectLog('a');
    component.setActionFilter('buy');
    expect(component.selectedLog?.id).toBe('b');
  });

  it('opens mobile detail mode on selection when isMobile is true', () => {
    component.isMobile = true;
    component.logs = [makeLog('a')];
    component.selectLog('a');
    expect(component.mobileDetailMode).toBeTrue();
  });

  it('does not open mobile detail mode on selection when isMobile is false', () => {
    component.isMobile = false;
    component.logs = [makeLog('a')];
    component.selectLog('a');
    expect(component.mobileDetailMode).toBeFalse();
  });

  it('closeMobileDetail turns mobileDetailMode off', () => {
    component.isMobile = true;
    component.logs = [makeLog('a')];
    component.selectLog('a');
    component.closeMobileDetail();
    expect(component.mobileDetailMode).toBeFalse();
  });
});
