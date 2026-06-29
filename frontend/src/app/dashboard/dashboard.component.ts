import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatBadgeModule } from '@angular/material/badge';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule } from '@angular/forms';
import { PortfolioService } from '../core/services/portfolio.service';
import { BotService } from '../core/services/bot.service';
import { Portfolio } from '../core/models/portfolio.model';
import { BotConfig } from '../core/models/bot-config.model';

type Market = 'MX' | 'USA';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTabsModule, MatCardModule, MatTableModule,
    MatSlideToggleModule, MatBadgeModule, MatIconModule,
    MatProgressSpinnerModule, MatChipsModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  activeMarket: Market = 'MX';
  portfolio: Portfolio | null = null;
  botConfigs: BotConfig[] = [];
  loading = true;
  error: string | null = null;
  positionColumns = ['ticker', 'position', 'avgCost', 'mktValue', 'unrealizedPnl'];

  private subs = new Subscription();

  constructor(
    private portfolioService: PortfolioService,
    private botService: BotService,
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.portfolioService.pollPortfolio(30_000).subscribe({
        next: portfolio => {
          this.portfolio = portfolio;
          this.loading = false;
        },
        error: err => {
          this.error = err.message;
          this.loading = false;
        },
      })
    );
    this.loadBotStatus();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  loadBotStatus(): void {
    this.botService.getStatus().subscribe({
      next: response => { this.botConfigs = response.configs; },
    });
  }

  get activeBotConfig(): BotConfig | undefined {
    return this.botConfigs.find(c => c.market === this.activeMarket);
  }

  get isRunning(): boolean {
    return this.activeBotConfig?.isActive ?? false;
  }

  toggleBot(running: boolean): void {
    const config = this.activeBotConfig;
    if (running && config) {
      this.botService.startBot({
        market: this.activeMarket,
        symbols: config.symbols,
        capitalLimit: config.capitalLimit,
        intervalMin: config.intervalMin,
      }).subscribe(() => this.loadBotStatus());
    } else {
      this.botService.stopBot(this.activeMarket)
        .subscribe(() => this.loadBotStatus());
    }
  }

  get currency(): string {
    return this.activeMarket === 'MX' ? 'MXN' : 'USD';
  }
}
