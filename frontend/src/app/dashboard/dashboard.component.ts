import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval, EMPTY } from 'rxjs';
import { startWith, switchMap, catchError } from 'rxjs/operators';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatBadgeModule } from '@angular/material/badge';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { PortfolioService } from '../core/services/portfolio.service';
import { BotService } from '../core/services/bot.service';
import { OrderService } from '../core/services/order.service';
import { Portfolio } from '../core/models/portfolio.model';
import { BotConfig } from '../core/models/bot-config.model';
import { Order } from '../core/models/order.model';
import { SymbolChartComponent } from '../symbol-chart/symbol-chart.component';
type Market = 'MX' | 'USA';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTabsModule, MatCardModule, MatTableModule,
    MatSlideToggleModule, MatBadgeModule, MatIconModule,
    MatProgressSpinnerModule,
    SymbolChartComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  activeMarket: Market = 'MX';
  portfolio: Portfolio | null = null;
  portfolioUpdatedAt: Date | null = null;
  botConfigs: BotConfig[] = [];
  marketOpen: { MX: boolean; USA: boolean } = { MX: false, USA: false };
  loading = true;
  error: string | null = null;
  pendingOrders: Order[] = [];
  positionColumns = ['ticker', 'position', 'avgCost', 'mktValue', 'unrealizedPnl'];
  orderColumns = ['ticker', 'side', 'orderType', 'totalSize', 'filledQuantity', 'remainingQuantity', 'status'];

  private subs = new Subscription();

  constructor(
    private portfolioService: PortfolioService,
    private botService: BotService,
    private orderService: OrderService,
  ) {}

  ngOnInit(): void {
    // Poll bot status every 60s — drives market-open state
    this.subs.add(
      interval(60_000).pipe(startWith(0)).subscribe(() => this.loadBotStatus())
    );

    // Poll pending orders every 30s
    this.subs.add(
      interval(30_000).pipe(
        startWith(0),
        switchMap(() => this.orderService.getPendingOrders()),
      ).subscribe(orders => { this.pendingOrders = orders; })
    );

    // Poll portfolio every 30s ONLY when market is open.
    // When market is closed, skip after the first successful fetch so we
    // don't hammer IBKR for data that won't change until the next session.
    this.subs.add(
      interval(30_000).pipe(
        startWith(0),
        switchMap(() => {
          if (!this.isActiveMarketOpen && this.portfolio !== null) {
            return EMPTY; // market closed and we already have data — skip
          }
          return this.portfolioService.getPortfolio().pipe(
            catchError(err => {
              this.error = err.message;
              this.loading = false;
              return EMPTY;
            })
          );
        }),
      ).subscribe(portfolio => {
        this.portfolio = portfolio;
        this.portfolioUpdatedAt = new Date();
        this.loading = false;
        this.error = null;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  loadBotStatus(): void {
    this.subs.add(
      this.botService.getStatus().subscribe({
        next: ({ configs, markets }) => {
          this.botConfigs = configs;
          this.marketOpen = markets;
        },
      })
    );
  }

  onTabChange(index: number): void {
    if (index === 0) this.activeMarket = 'MX';
    else if (index === 1) this.activeMarket = 'USA';
  }

  get activeBotConfig(): BotConfig | undefined {
    return this.botConfigs.find(c => c.market === this.activeMarket);
  }

  get isRunning(): boolean {
    return this.activeBotConfig?.isActive ?? false;
  }

  get isActiveMarketOpen(): boolean {
    return this.marketOpen[this.activeMarket];
  }

  toggleBot(running: boolean): void {
    const config = this.activeBotConfig;
    if (running && config) {
      this.subs.add(
        this.botService.startBot({
          market: this.activeMarket,
          symbols: config.symbols,
          capitalLimit: config.capitalLimit,
          intervalMin: config.intervalMin,
          confidenceThreshold: config.confidenceThreshold ?? 0.65,
        }).subscribe(() => this.loadBotStatus())
      );
    } else {
      this.subs.add(
        this.botService.stopBot(this.activeMarket)
          .subscribe(() => this.loadBotStatus())
      );
    }
  }

  get currency(): string {
    return this.activeMarket === 'MX' ? 'MXN' : 'USD';
  }

  get activeSymbols(): string[] {
    return this.activeBotConfig?.symbols ?? [];
  }
}
