import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription, interval } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';
import { AgentLogService } from '../core/services/agent-log.service';
import { AgentLog } from '../core/models/agent-log.model';

@Component({
  selector: 'app-agent-log',
  standalone: true,
  imports: [CommonModule, MatChipsModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './agent-log.component.html',
  styleUrls: ['./agent-log.component.scss'],
})
export class AgentLogComponent implements OnInit, OnChanges, OnDestroy {
  @Input() market: 'MX' | 'USA' = 'MX';
  @Input() isRunning = false;

  logs: AgentLog[] = [];
  loading = false;
  actionFilter: 'all' | 'buy' | 'sell' | 'hold' = 'all';
  private expandedLogs = new Set<string>();

  get filteredLogs(): AgentLog[] {
    if (this.actionFilter === 'all') return this.logs;
    return this.logs.filter(l => l.response.action === this.actionFilter);
  }

  isExpanded(id: string): boolean {
    return this.expandedLogs.has(id);
  }

  toggleExpand(id: string): void {
    if (this.expandedLogs.has(id)) this.expandedLogs.delete(id);
    else this.expandedLogs.add(id);
  }

  setActionFilter(f: 'all' | 'buy' | 'sell' | 'hold'): void {
    this.actionFilter = f;
  }

  inputFieldLabels: Record<string, string> = {
    lastPrice: 'Last Price',
    changePct: 'Day Change %',
    volume: 'Volume',
    rsi14: 'RSI (14)',
    ma20: 'MA20',
    ma50: 'MA50',
    percentChange5d: '5d Change %',
    volumeRatio: 'Volume Ratio',
  };

  readonly inputKeys = Object.keys(this.inputFieldLabels);

  private pollSub: Subscription | null = null;

  constructor(private agentLogService: AgentLogService) {}

  ngOnInit(): void {
    this.startPolling();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['market']?.firstChange || changes['isRunning']?.firstChange) return;
    if (changes['market'] || changes['isRunning']) {
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
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
    const ind = md?.indicators;
    const map: Record<string, string> = {
      lastPrice: md?.lastPrice != null ? md.lastPrice.toFixed(2) : '—',
      changePct: md?.changePct != null ? `${md.changePct >= 0 ? '+' : ''}${md.changePct.toFixed(2)}%` : '—',
      volume: md?.volume != null ? md.volume.toLocaleString() : '—',
      rsi14: ind?.rsi14 != null ? ind.rsi14.toFixed(2) : '—',
      ma20: ind?.ma20 != null ? ind.ma20.toFixed(2) : '—',
      ma50: ind?.ma50 != null ? ind.ma50.toFixed(2) : '—',
      percentChange5d: ind?.percentChange5d != null ? `${ind.percentChange5d >= 0 ? '+' : ''}${ind.percentChange5d.toFixed(2)}%` : '—',
      volumeRatio: ind?.volumeRatio != null ? `${ind.volumeRatio.toFixed(2)}x` : '—',
    };
    return map[key] ?? '—';
  }

  getActionClass(action: string): string {
    return `action-${action}`;
  }
}
