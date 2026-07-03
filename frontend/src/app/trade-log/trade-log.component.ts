import { BreakpointObserver } from '@angular/cdk/layout';
import { Subscription } from 'rxjs';
import { Component, OnInit, OnDestroy, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TradeService, TradeFilters } from '../core/services/trade.service';
import { Trade } from '../core/models/trade.model';

@Component({
  selector: 'app-trade-log',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatSelectModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatDialogModule,
  ],
  templateUrl: './trade-log.component.html',
  styleUrls: ['./trade-log.component.scss'],
})
export class TradeLogComponent implements OnInit, OnDestroy {
  trades: Trade[] = [];
  loading = false;
  isMobile = false;
  mobileDetailMode = false;

  marketFilter: 'MX' | 'USA' | '' = '';
  symbolFilter = '';

  @ViewChild('filtersDialog') filtersDialogTpl!: TemplateRef<unknown>;

  private selectedTradeId: string | null = null;
  private breakpointSub: Subscription | null = null;

  constructor(
    private tradeService: TradeService,
    private breakpointObserver: BreakpointObserver,
    private dialog: MatDialog,
  ) {}

  openFilters(): void {
    this.dialog.open(this.filtersDialogTpl, { width: '90vw', maxWidth: '400px' });
  }

  get tradeCountLabel(): string {
    const n = this.trades.length;
    if (n === 0) return 'No trades yet';
    return `That's everything so far — ${n} trade${n === 1 ? '' : 's'} executed`;
  }

  get selectedTrade(): Trade | null {
    return this.trades.find(t => t.id === this.selectedTradeId) ?? this.trades[0] ?? null;
  }

  selectTrade(id: string): void {
    this.selectedTradeId = id;
    if (this.isMobile) this.mobileDetailMode = true;
  }

  closeMobileDetail(): void {
    this.mobileDetailMode = false;
  }

  ngOnInit(): void {
    this.loadTrades();
    this.breakpointSub = this.breakpointObserver.observe('(max-width: 768px)').subscribe(result => {
      this.isMobile = result.matches;
    });
  }

  ngOnDestroy(): void {
    this.breakpointSub?.unsubscribe();
  }

  loadTrades(): void {
    this.loading = true;
    const filters: TradeFilters = {
      ...(this.marketFilter ? { market: this.marketFilter as 'MX' | 'USA' } : {}),
      ...(this.symbolFilter ? { symbol: this.symbolFilter.toUpperCase() } : {}),
    };
    this.tradeService.getTrades(filters).subscribe({
      next: trades => { this.trades = trades; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  clearFilters(): void {
    this.marketFilter = '';
    this.symbolFilter = '';
    this.loadTrades();
  }

  getActionClass(action: string): string {
    return action === 'buy' ? 'action-buy' : action === 'sell' ? 'action-sell' : 'action-hold';
  }
}
