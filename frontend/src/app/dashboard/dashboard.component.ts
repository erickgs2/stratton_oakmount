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
import { PnlService } from '../core/services/pnl.service';
import { Portfolio } from '../core/models/portfolio.model';
import { BotConfig } from '../core/models/bot-config.model';
import { Order } from '../core/models/order.model';
import { PnlReport } from '../core/models/pnl.model';
import { SymbolChartComponent } from '../symbol-chart/symbol-chart.component';
import { Market } from '../core/models/market.model';
import { CryptoPortfolioService } from '../core/services/crypto-portfolio.service';
import { CryptoPortfolio } from '../core/models/crypto-portfolio.model';
import { TabPersistenceService } from '../core/services/tab-persistence.service';

const DASHBOARD_TAB_KEY = 'dashboard-active-tab';

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
  activeTabIndex: number;
  activeMarket: Market;
  portfolio: Portfolio | null = null;
  portfolioUpdatedAt: Date | null = null;
  botConfigs: BotConfig[] = [];
  marketOpen: { MX: boolean; USA: boolean; CRYPTO: boolean } = { MX: false, USA: false, CRYPTO: false };
  loading = true;
  error: string | null = null;
  pendingOrders: Order[] = [];
  positionColumns = ['ticker', 'position', 'avgCost', 'mktValue', 'unrealizedPnl'];
  orderColumns = ['ticker', 'side', 'orderType', 'totalSize', 'filledQuantity', 'remainingQuantity', 'status'];
  pnlReports: { MX: PnlReport | null; USA: PnlReport | null; CRYPTO: PnlReport | null } = { MX: null, USA: null, CRYPTO: null };

  cryptoPortfolio: CryptoPortfolio | null = null;
  cryptoLoading = true;
  cryptoError: string | null = null;
  cryptoPositionColumns = ['book', 'quantity', 'lastPrice', 'mktValue'];

  private subs = new Subscription();

  constructor(
    private portfolioService: PortfolioService,
    private botService: BotService,
    private orderService: OrderService,
    private pnlService: PnlService,
    private cryptoPortfolioService: CryptoPortfolioService,
    private tabPersistence: TabPersistenceService,
  ) {
    this.activeTabIndex = this.tabPersistence.getSavedIndex(DASHBOARD_TAB_KEY, 2);
    this.activeMarket = this.indexToMarket(this.activeTabIndex);
  }

  private indexToMarket(index: number): Market {
    if (index === 0) return 'MX';
    if (index === 1) return 'USA';
    return 'CRYPTO';
  }

  ngOnInit(): void {
    // Poll bot status every 60s — drives market-open state
    this.subs.add(
      interval(60_000).pipe(startWith(0)).subscribe(() => this.loadBotStatus())
    );

    // Poll realized P&L every 60s — only changes when trades execute, same
    // cadence as bot status. Fetch both markets so switching tabs is instant.
    this.subs.add(
      interval(60_000).pipe(startWith(0)).subscribe(() => this.loadPnl())
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

    // Poll crypto portfolio every 30s — separate from the IBKR portfolio
    // polling above since it's a distinct endpoint/data shape (Bitso has no
    // "market closed" concept, so this always polls, unlike the IBKR one).
    this.subs.add(
      interval(30_000).pipe(
        startWith(0),
        switchMap(() => this.cryptoPortfolioService.getPortfolio().pipe(
          catchError(err => {
            this.cryptoError = err.message;
            this.cryptoLoading = false;
            return EMPTY;
          })
        )),
      ).subscribe(portfolio => {
        this.cryptoPortfolio = portfolio;
        this.cryptoLoading = false;
        this.cryptoError = null;
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

  loadPnl(): void {
    (['MX', 'USA', 'CRYPTO'] as const).forEach(market => {
      this.subs.add(
        this.pnlService.getReport(market).subscribe({
          next: report => { this.pnlReports[market] = report; },
        })
      );
    });
  }

  get activePnl(): PnlReport | null {
    return this.pnlReports[this.activeMarket];
  }

  onTabChange(index: number): void {
    this.activeTabIndex = index;
    this.activeMarket = this.indexToMarket(index);
    this.tabPersistence.saveIndex(DASHBOARD_TAB_KEY, index);
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
          takeProfitPct: config.takeProfitPct ?? 1.5,
          stopLossPct: config.stopLossPct ?? 1.0,
          feeEstimatePct: config.feeEstimatePct,
          tpSlBypassEnabled: config.tpSlBypassEnabled ?? false,
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
    if (this.activeMarket === 'MX') return 'MXN';
    if (this.activeMarket === 'USA') return 'USD';
    return 'MXN';
  }

  get activeSymbols(): string[] {
    return this.activeBotConfig?.symbols ?? [];
  }
}
