import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Market } from '../core/models/market.model';
import { PnlService } from '../core/services/pnl.service';
import { PnlReport } from '../core/models/pnl.model';
import { TabPersistenceService } from '../core/services/tab-persistence.service';

const PNL_HISTORY_TAB_KEY = 'pnl-history-active-tab';

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
  activeTabIndex: number;
  activeMarket: Market;
  reports: { MX: PnlReport | null; USA: PnlReport | null; CRYPTO: PnlReport | null } = { MX: null, USA: null, CRYPTO: null };
  loading = true;
  dayColumns = ['date', 'outcome', 'realizedPnl', 'buys', 'sells', 'holds'];

  constructor(
    private pnlService: PnlService,
    private tabPersistence: TabPersistenceService,
  ) {
    this.activeTabIndex = this.tabPersistence.getSavedIndex(PNL_HISTORY_TAB_KEY, 2);
    this.activeMarket = this.indexToMarket(this.activeTabIndex);
  }

  private indexToMarket(index: number): Market {
    if (index === 0) return 'MX';
    if (index === 1) return 'USA';
    return 'CRYPTO';
  }

  ngOnInit(): void {
    this.loadReports();
  }

  loadReports(): void {
    this.loading = true;
    let remaining = 3;
    (['MX', 'USA', 'CRYPTO'] as const).forEach(market => {
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
    this.activeTabIndex = index;
    this.activeMarket = this.indexToMarket(index);
    this.tabPersistence.saveIndex(PNL_HISTORY_TAB_KEY, index);
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
