import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Subscription, interval } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';
import { AgentLogService } from '../core/services/agent-log.service';
import { AgentLog } from '../core/models/agent-log.model';
import { Market } from '../core/models/market.model';

@Component({
  selector: 'app-agent-log',
  standalone: true,
  imports: [CommonModule, MatChipsModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './agent-log.component.html',
  styleUrls: ['./agent-log.component.scss'],
})
export class AgentLogComponent implements OnInit, OnChanges, OnDestroy {
  @Input() market: Market = 'MX';
  @Input() isRunning = false;

  logs: AgentLog[] = [];
  loading = false;
  actionFilter: 'all' | 'buy' | 'sell' | 'hold' = 'all';
  isMobile = false;
  mobileDetailMode = false;
  private selectedLogId: string | null = null;

  get filteredLogs(): AgentLog[] {
    if (this.actionFilter === 'all') return this.logs;
    return this.logs.filter(l => l.response.action === this.actionFilter);
  }

  get selectedLog(): AgentLog | null {
    const list = this.filteredLogs;
    return list.find(l => l.id === this.selectedLogId) ?? list[0] ?? null;
  }

  selectLog(id: string): void {
    this.selectedLogId = id;
    if (this.isMobile) this.mobileDetailMode = true;
  }

  closeMobileDetail(): void {
    this.mobileDetailMode = false;
  }

  setActionFilter(f: 'all' | 'buy' | 'sell' | 'hold'): void {
    this.actionFilter = f;
  }

  get inputFieldLabels(): Record<string, string> {
    if (this.market === 'CRYPTO') {
      return {
        lastPrice: 'Last Price (MXN)',
        changePctSinceSnapshot: 'Change Since Last Check',
        orderBookImbalance: 'Order Book Imbalance',
        spreadPct: 'Bid/Ask Spread',
      };
    }
    return {
      lastPrice: 'Last Price',
      changePct: 'Day Change %',
      volume: 'Volume',
      rsi14: 'RSI (14)',
      ma20: 'MA20',
      ma50: 'MA50',
      percentChange5d: '5d Change %',
      volumeRatio: 'Volume Ratio',
    };
  }

  get inputKeys(): string[] {
    return Object.keys(this.inputFieldLabels);
  }

  private pollSub: Subscription | null = null;
  private breakpointSub: Subscription | null = null;

  constructor(
    private agentLogService: AgentLogService,
    private breakpointObserver: BreakpointObserver,
  ) {}

  ngOnInit(): void {
    this.startPolling();
    this.breakpointSub = this.breakpointObserver.observe('(max-width: 768px)').subscribe(result => {
      this.isMobile = result.matches;
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['market']?.firstChange || changes['isRunning']?.firstChange) return;
    if (changes['market'] || changes['isRunning']) {
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.breakpointSub?.unsubscribe();
  }

  private startPolling(): void {
    this.pollSub?.unsubscribe();
    this.loading = true;

    if (this.isRunning) {
      this.pollSub = interval(30_000).pipe(
        startWith(0),
        switchMap(() => this.agentLogService.getLogs(this.market))
      ).subscribe({
        next: ({ logs }) => { this.logs = logs; this.loading = false; },
        error: () => { this.loading = false; },
      });
    } else {
      this.pollSub = this.agentLogService.getLogs(this.market).subscribe({
        next: ({ logs }) => { this.logs = logs; this.loading = false; },
        error: () => { this.loading = false; },
      });
    }
  }

  getFieldValue(log: AgentLog, key: string): string {
    const md = log.marketData;
    const ind = md?.indicators as unknown as Record<string, number | null | undefined> | undefined;

    if (this.market === 'CRYPTO') {
      const map: Record<string, string> = {
        lastPrice: md?.lastPrice != null ? `${md.lastPrice.toFixed(2)} MXN` : '—',
        changePctSinceSnapshot: ind?.['changePctSinceSnapshot'] != null
          ? `${(ind['changePctSinceSnapshot'] as number) >= 0 ? '+' : ''}${(ind['changePctSinceSnapshot'] as number).toFixed(2)}%`
          : 'insufficient history yet',
        orderBookImbalance: ind?.['orderBookImbalance'] != null ? (ind['orderBookImbalance'] as number).toFixed(2) : '—',
        spreadPct: ind?.['spreadPct'] != null ? `${(ind['spreadPct'] as number).toFixed(3)}%` : '—',
      };
      return map[key] ?? '—';
    }

    const map: Record<string, string> = {
      lastPrice: md?.lastPrice != null ? md.lastPrice.toFixed(2) : '—',
      changePct: md?.changePct != null ? `${md.changePct >= 0 ? '+' : ''}${md.changePct.toFixed(2)}%` : '—',
      volume: md?.volume != null ? md.volume.toLocaleString() : '—',
      rsi14: ind?.['rsi14'] != null ? (ind['rsi14'] as number).toFixed(2) : '—',
      ma20: ind?.['ma20'] != null ? (ind['ma20'] as number).toFixed(2) : '—',
      ma50: ind?.['ma50'] != null ? (ind['ma50'] as number).toFixed(2) : '—',
      percentChange5d: ind?.['percentChange5d'] != null ? `${(ind['percentChange5d'] as number) >= 0 ? '+' : ''}${(ind['percentChange5d'] as number).toFixed(2)}%` : '—',
      volumeRatio: ind?.['volumeRatio'] != null ? `${(ind['volumeRatio'] as number).toFixed(2)}x` : '—',
    };
    return map[key] ?? '—';
  }

  getActionClass(action: string): string {
    return `action-${action}`;
  }
}
