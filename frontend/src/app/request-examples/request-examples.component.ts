import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AgentLogService } from '../core/services/agent-log.service';
import { AgentRequestPreview } from '../core/models/agent-request-preview.model';
import { Market } from '../core/models/market.model';

interface PreviewSlot {
  market: Market;
  label: string;
  preview: AgentRequestPreview | null;
  error: string | null;
}

interface ReadableRow {
  label: string;
  value: string;
}

@Component({
  selector: 'app-request-examples',
  standalone: true,
  imports: [CommonModule, MatExpansionModule, MatProgressSpinnerModule],
  templateUrl: './request-examples.component.html',
  styleUrls: ['./request-examples.component.scss'],
})
export class RequestExamplesComponent {
  loaded = false;
  loading = false;

  slots: PreviewSlot[] = [
    { market: 'MX', label: 'MX — BMV', preview: null, error: null },
    { market: 'USA', label: 'USA — NYSE/Nasdaq', preview: null, error: null },
    { market: 'CRYPTO', label: 'CRYPTO — Bitso', preview: null, error: null },
  ];

  constructor(private agentLogService: AgentLogService) {}

  onExpand(): void {
    if (this.loaded || this.loading) return;
    this.loading = true;

    forkJoin(
      this.slots.map(slot =>
        this.agentLogService.getRequestPreview(slot.market).pipe(
          catchError(err => of({ __error: err?.error?.error ?? 'Could not load a live example right now' }))
        )
      )
    ).subscribe(results => {
      results.forEach((result, i) => {
        if (result && '__error' in result) {
          this.slots[i].error = (result as { __error: string }).__error;
        } else {
          this.slots[i].preview = result as AgentRequestPreview;
        }
      });
      this.loading = false;
      this.loaded = true;
    });
  }

  readableRows(preview: AgentRequestPreview): ReadableRow[] {
    if (preview.market === 'CRYPTO') {
      const r = preview.readable;
      const currency = r.currency;
      return [
        { label: 'Symbol', value: preview.symbol },
        { label: 'Last Price', value: `${r.lastPrice.toFixed(2)} ${currency}` },
        { label: '24h Change', value: `${r.changePct24h >= 0 ? '+' : ''}${r.changePct24h.toFixed(2)}%` },
        { label: '24h Volume', value: r.volume24h.toLocaleString() },
        { label: 'Order Book Imbalance', value: r.orderBookImbalance.toFixed(2) },
        { label: 'Bid/Ask Spread', value: `${r.spreadPct.toFixed(3)}%` },
        { label: 'Since Last Cycle', value: r.changePctSinceLastCycle != null ? `${r.changePctSinceLastCycle >= 0 ? '+' : ''}${r.changePctSinceLastCycle.toFixed(2)}%` : 'insufficient history yet' },
        { label: 'Recent Trend (multi-hour)', value: r.changePctTrend != null ? `${r.changePctTrend >= 0 ? '+' : ''}${r.changePctTrend.toFixed(2)}%` : 'insufficient history yet' },
        { label: 'Capital Limit', value: r.capitalLimit != null ? `${r.capitalLimit.toFixed(2)} ${currency}` : 'not set' },
        { label: 'Check Frequency', value: `every ${r.intervalMin} min` },
        { label: 'Available Funds', value: `${r.availableFunds.toFixed(2)} ${currency}` },
        { label: 'Effective Capital', value: `${r.effectiveCapital.toFixed(2)} ${currency}` },
        { label: 'Net Liquidation', value: `${r.netLiquidation.toFixed(2)} ${currency}` },
        { label: 'Total Unrealized P&L', value: `${r.totalUnrealizedPnl >= 0 ? '+' : ''}${r.totalUnrealizedPnl.toFixed(2)} ${currency}` },
        { label: 'Current Position', value: r.currentPosition > 0 ? `${r.currentPosition} @ ${r.currentAvgCost.toFixed(2)} ${currency}` : 'none' },
      ];
    }

    const r = preview.readable;
    const currency = r.currency;
    return [
      { label: 'Symbol', value: preview.symbol },
      { label: 'Last Price', value: `${r.lastPrice.toFixed(2)} ${currency}` },
      { label: 'Day Change', value: `${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(2)}%` },
      { label: 'Volume', value: r.volume.toLocaleString() },
      { label: 'RSI (14)', value: r.rsi14.toFixed(2) },
      { label: 'MA20', value: `${r.ma20.toFixed(2)} ${currency}` },
      { label: 'MA50', value: `${r.ma50.toFixed(2)} ${currency}` },
      { label: '5-Day Change', value: `${r.percentChange5d >= 0 ? '+' : ''}${r.percentChange5d.toFixed(2)}%` },
      { label: 'Volume Ratio', value: `${r.volumeRatio.toFixed(2)}x` },
      { label: 'Capital Limit', value: r.capitalLimit != null ? `${r.capitalLimit.toFixed(2)} ${currency}` : 'not set' },
      { label: 'Check Frequency', value: `every ${r.intervalMin} min` },
      { label: 'Available Funds', value: `${r.availableFunds.toFixed(2)} ${currency}` },
      { label: 'Effective Capital', value: `${r.effectiveCapital.toFixed(2)} ${currency}` },
      { label: 'Net Liquidation', value: `${r.netLiquidation.toFixed(2)} ${currency}` },
      { label: 'Total Unrealized P&L', value: `${r.totalUnrealizedPnl >= 0 ? '+' : ''}${r.totalUnrealizedPnl.toFixed(2)} ${currency}` },
      { label: 'Current Position', value: r.currentPosition > 0 ? `${r.currentPosition} shares @ ${r.currentAvgCost.toFixed(2)} ${currency}` : 'none' },
    ];
  }

  requestJson(preview: AgentRequestPreview): string {
    return JSON.stringify(preview.request, null, 2);
  }
}
