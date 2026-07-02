import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PnlService } from '../core/services/pnl.service';
import { PnlReport } from '../core/models/pnl.model';

type Market = 'MX' | 'USA';

@Component({
  selector: 'app-pnl-history',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule, MatCardModule, MatTableModule,
    MatIconModule, MatProgressSpinnerModule,
  ],
  templateUrl: './pnl-history.component.html',
  styleUrls: ['./pnl-history.component.scss'],
})
export class PnlHistoryComponent implements OnInit {
  activeMarket: Market = 'MX';
  reports: { MX: PnlReport | null; USA: PnlReport | null } = { MX: null, USA: null };
  loading = true;
  dayColumns = ['date', 'outcome', 'realizedPnl', 'buys', 'sells', 'holds'];

  constructor(private pnlService: PnlService) {}

  ngOnInit(): void {
    this.loadReports();
  }

  loadReports(): void {
    this.loading = true;
    let remaining = 2;
    (['MX', 'USA'] as const).forEach(market => {
      this.pnlService.getReport(market).subscribe({
        next: report => {
          this.reports[market] = report;
          remaining -= 1;
          if (remaining <= 0) this.loading = false;
        },
        error: () => {
          remaining -= 1;
          if (remaining <= 0) this.loading = false;
        },
      });
    });
  }

  onTabChange(index: number): void {
    this.activeMarket = index === 0 ? 'MX' : 'USA';
  }

  get activeReport(): PnlReport | null {
    return this.reports[this.activeMarket];
  }

  outcomeClass(outcome: 'win' | 'loss' | 'flat'): string {
    return outcome === 'win' ? 'outcome-win' : outcome === 'loss' ? 'outcome-loss' : 'outcome-flat';
  }

  outcomeLabel(outcome: 'win' | 'loss' | 'flat'): string {
    return outcome === 'win' ? 'Win' : outcome === 'loss' ? 'Loss' : 'Flat';
  }
}
