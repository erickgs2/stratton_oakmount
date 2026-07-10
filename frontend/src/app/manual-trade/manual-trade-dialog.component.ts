import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { Market } from '../core/models/market.model';
import { symbolsForMarket } from '../core/models/market-symbols';
import { ManualTradeService } from '../core/services/manual-trade.service';
import { MarketDataService } from '../core/services/market-data.service';

export interface ManualTradeDialogData {
  market: Market;
  availableFunds: number;
  heldQuantities: Record<string, number>;
}

@Component({
  selector: 'app-manual-trade-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonToggleModule,
    MatFormFieldModule, MatSelectModule, MatInputModule, MatButtonModule,
  ],
  templateUrl: './manual-trade-dialog.component.html',
  styleUrl: './manual-trade-dialog.component.scss',
})
export class ManualTradeDialogComponent implements OnInit {
  step: 'form' | 'confirm' = 'form';
  side: 'buy' | 'sell' = 'buy';
  symbol: string;
  quantity: number | null = null;
  mxnAmount: number | null = null;
  livePrice: number | null = null;
  loadingPrice = false;
  submitting = false;
  errorMessage = '';

  readonly symbols: string[];
  readonly isCrypto: boolean;

  constructor(
    private dialogRef: MatDialogRef<ManualTradeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ManualTradeDialogData,
    private manualTradeService: ManualTradeService,
    private marketDataService: MarketDataService,
  ) {
    this.symbols = symbolsForMarket(data.market);
    this.isCrypto = data.market === 'CRYPTO';
    this.symbol = this.symbols[0];
  }

  ngOnInit(): void {
    this.fetchPrice();
  }

  onSymbolChange(): void {
    this.fetchPrice();
  }

  private fetchPrice(): void {
    this.loadingPrice = true;
    this.livePrice = null;
    const source$ =
      this.data.market === 'MX' ? this.marketDataService.getMXData(this.symbol) :
      this.data.market === 'USA' ? this.marketDataService.getUSAData(this.symbol) :
      this.marketDataService.getCryptoData(this.symbol);

    source$.subscribe({
      next: data => { this.livePrice = data.lastPrice; this.loadingPrice = false; },
      error: () => { this.loadingPrice = false; },
    });
  }

  get heldQuantity(): number {
    return this.data.heldQuantities[this.symbol] ?? 0;
  }

  get estimatedTotal(): number {
    if (this.isCrypto) return this.mxnAmount ?? 0;
    return (this.quantity ?? 0) * (this.livePrice ?? 0);
  }

  reviewOrder(): void {
    this.errorMessage = '';
    if (this.isCrypto) {
      if (!this.mxnAmount || this.mxnAmount <= 0) {
        this.errorMessage = 'Enter a valid MXN amount';
        return;
      }
    } else {
      if (!this.quantity || this.quantity <= 0 || !Number.isInteger(this.quantity)) {
        this.errorMessage = 'Enter a valid whole number of shares';
        return;
      }
    }
    this.step = 'confirm';
  }

  back(): void {
    this.step = 'form';
  }

  confirmOrder(): void {
    this.submitting = true;
    this.errorMessage = '';
    this.manualTradeService.execute({
      market: this.data.market,
      symbol: this.symbol,
      side: this.side,
      ...(this.isCrypto ? { mxnAmount: this.mxnAmount ?? undefined } : { quantity: this.quantity ?? undefined }),
    }).subscribe({
      next: () => {
        this.submitting = false;
        this.dialogRef.close(true);
      },
      error: err => {
        this.submitting = false;
        this.errorMessage = err?.error?.error ?? 'Failed to place order, please try again';
      },
    });
  }
}
