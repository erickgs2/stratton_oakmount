import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { TradeService, TradeFilters } from '../core/services/trade.service';
import { Trade } from '../core/models/trade.model';

@Component({
  selector: 'app-trade-log',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatSelectModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatChipsModule,
  ],
  templateUrl: './trade-log.component.html',
  styleUrls: ['./trade-log.component.scss'],
})
export class TradeLogComponent implements OnInit {
  trades: Trade[] = [];
  loading = false;
  displayedColumns = ['createdAt', 'symbol', 'market', 'action', 'quantity', 'price', 'currency', 'reason'];

  marketFilter: 'MX' | 'USA' | '' = '';
  symbolFilter = '';

  constructor(private tradeService: TradeService) {}

  ngOnInit(): void {
    this.loadTrades();
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
