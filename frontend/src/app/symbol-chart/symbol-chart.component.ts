import { Component, Input, OnInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarketDataService } from '../core/services/market-data.service';
import { MXMarketData, MarketDataPoint } from '../core/models/market-data.model';
import { Market } from '../core/models/market.model';

interface ChartPoint { x: number; y: number; }

@Component({
  selector: 'app-symbol-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './symbol-chart.component.html',
  styleUrls: ['./symbol-chart.component.scss'],
})
export class SymbolChartComponent implements OnInit, OnChanges {
  @Input() symbol = '';
  @Input() market: Market = 'MX';

  data: MXMarketData | null = null;
  loading = true;
  error = false;

  readonly W = 280;
  readonly H = 80;
  readonly PAD = 4;

  polyline = '';
  area = '';
  minPrice = 0;
  maxPrice = 0;

  constructor(private marketDataService: MarketDataService) {}

  ngOnInit(): void { this.load(); }
  ngOnChanges(): void { this.load(); }

  // true once buildChart() produced an actual line — false while a symbol
  // (crypto, typically) hasn't accumulated enough history yet.
  get hasEnoughHistory(): boolean {
    return this.polyline !== '';
  }

  private load(): void {
    if (!this.symbol) return;
    this.loading = true;
    this.error = false;
    this.polyline = '';
    this.area = '';
    const request = this.market === 'USA'
      ? this.marketDataService.getUSAData(this.symbol)
      : this.market === 'CRYPTO'
        ? this.marketDataService.getCryptoData(this.symbol)
        : this.marketDataService.getMXData(this.symbol);
    request.subscribe({
      next: data => {
        this.data = data;
        this.buildChart(data.history);
        this.loading = false;
      },
      error: () => {
        this.error = true;
        this.loading = false;
      },
    });
  }

  private buildChart(history: MarketDataPoint[]): void {
    if (history.length < 2) return;

    const prices = history.map(h => h.close);
    this.minPrice = Math.min(...prices);
    this.maxPrice = Math.max(...prices);
    const range = this.maxPrice - this.minPrice || 1;

    const points: ChartPoint[] = prices.map((p, i) => ({
      x: this.PAD + (i / (prices.length - 1)) * (this.W - this.PAD * 2),
      y: this.PAD + (1 - (p - this.minPrice) / range) * (this.H - this.PAD * 2),
    }));

    this.polyline = points.map(p => `${p.x},${p.y}`).join(' ');
    const last = points[points.length - 1];
    this.area =
      `M ${points[0].x},${this.H} ` +
      points.map(p => `L ${p.x},${p.y}`).join(' ') +
      ` L ${last.x},${this.H} Z`;
  }

  get changeClass(): string {
    const c = this.data?.changePct ?? 0;
    return c > 0 ? 'up' : c < 0 ? 'down' : 'flat';
  }

  get changeSign(): string {
    const c = this.data?.changePct ?? 0;
    return c > 0 ? '+' : '';
  }
}
