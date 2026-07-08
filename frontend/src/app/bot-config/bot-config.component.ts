import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, switchMap, of } from 'rxjs';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule, MatChipListboxChange } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BotService } from '../core/services/bot.service';
import { SettingsService } from '../core/services/settings.service';
import { BotConfig } from '../core/models/bot-config.model';
import { Market } from '../core/models/market.model';
import { TabPersistenceService } from '../core/services/tab-persistence.service';

const MX_SYMBOLS = ['AMXL', 'FEMSAUBD', 'WALMEX', 'BIMBOA', 'GCARSOA1'];
const USA_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'];
const CRYPTO_SYMBOLS = ['btc_mxn', 'eth_mxn'];
const BOT_CONFIG_TAB_KEY = 'bot-config-active-tab';

@Component({
  selector: 'app-bot-config',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTabsModule, MatChipsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatSlideToggleModule, MatSnackBarModule, MatCardModule,
    MatIconModule, MatTooltipModule,
  ],
  templateUrl: './bot-config.component.html',
  styleUrls: ['./bot-config.component.scss'],
})
export class BotConfigComponent implements OnInit {
  mxSymbols = MX_SYMBOLS;
  usaSymbols = USA_SYMBOLS;
  cryptoSymbols = CRYPTO_SYMBOLS;

  mxConfig: Partial<BotConfig> = {
    market: 'MX', symbols: ['AMXL'], capitalLimit: 10000, intervalMin: 15,
    confidenceThreshold: 0.65, takeProfitPct: 1.5, stopLossPct: 1.0, feeEstimatePct: 0.30,
  };
  usaConfig: Partial<BotConfig> = {
    market: 'USA', symbols: ['AAPL'], capitalLimit: 1000, intervalMin: 15,
    confidenceThreshold: 0.65, takeProfitPct: 1.5, stopLossPct: 1.0, feeEstimatePct: 0.05,
  };
  cryptoConfig: Partial<BotConfig> = {
    market: 'CRYPTO', symbols: ['btc_mxn'], capitalLimit: 500, intervalMin: 15,
    confidenceThreshold: 0.65, takeProfitPct: 1.5, stopLossPct: 1.0, feeEstimatePct: 0.65,
  };

  saving = false;

  ibkrAccountId = '';
  settingsSaving = false;
  loggingOut = false;

  activeTabIndex: number;

  constructor(
    private botService: BotService,
    private settingsService: SettingsService,
    private snackBar: MatSnackBar,
    private tabPersistence: TabPersistenceService,
  ) {
    this.activeTabIndex = this.tabPersistence.getSavedIndex(BOT_CONFIG_TAB_KEY, 2);
  }

  onTabChange(index: number): void {
    this.activeTabIndex = index;
    this.tabPersistence.saveIndex(BOT_CONFIG_TAB_KEY, index);
  }

  ngOnInit(): void {
    this.botService.getStatus().subscribe(response => {
      const mx = response.configs.find(c => c.market === 'MX');
      const usa = response.configs.find(c => c.market === 'USA');
      const crypto = response.configs.find(c => c.market === 'CRYPTO');
      if (mx) this.mxConfig = { ...mx };
      if (usa) this.usaConfig = { ...usa };
      if (crypto) this.cryptoConfig = { ...crypto };
    });

    this.settingsService.getSettings().subscribe(settings => {
      this.ibkrAccountId = settings.ibkrAccountId ?? '';
    });
  }

  saveIbkrAccountId(): void {
    const trimmed = this.ibkrAccountId.trim();
    if (!trimmed) {
      this.snackBar.open('Account ID cannot be empty', 'OK', { duration: 3000 });
      return;
    }
    this.settingsSaving = true;
    this.settingsService.updateSettings(trimmed).subscribe({
      next: () => {
        this.snackBar.open('IBKR account ID saved', 'OK', { duration: 3000 });
        this.settingsSaving = false;
      },
      error: () => { this.settingsSaving = false; },
    });
  }

  logoutOfGateway(): void {
    if (!confirm('Log out of the IBKR gateway? You will need to log in again to reconnect.')) {
      return;
    }
    this.loggingOut = true;
    this.settingsService.logout().subscribe({
      next: (result) => {
        this.snackBar.open(
          result.success ? 'Logged out of the IBKR gateway' : 'Logout request sent (gateway may already be disconnected)',
          'OK',
          { duration: 4000 },
        );
        this.loggingOut = false;
      },
      error: () => { this.loggingOut = false; },
    });
  }

  onSymbolChange(event: MatChipListboxChange, market: Market): void {
    const selected = Array.isArray(event.value) ? event.value : [event.value];
    if (market === 'MX') this.mxConfig.symbols = selected;
    else if (market === 'USA') this.usaConfig.symbols = selected;
    else this.cryptoConfig.symbols = selected;
  }

  saveConfig(market: Market): void {
    const config = market === 'MX' ? this.mxConfig : market === 'USA' ? this.usaConfig : this.cryptoConfig;
    this.saving = true;

    const payload = {
      market,
      symbols: config.symbols ?? [],
      capitalLimit: config.capitalLimit ?? 10000,
      intervalMin: config.intervalMin ?? 15,
      confidenceThreshold: config.confidenceThreshold ?? 0.65,
      takeProfitPct: config.takeProfitPct ?? 1.5,
      stopLossPct: config.stopLossPct ?? 1.0,
      feeEstimatePct: config.feeEstimatePct ?? 0.10,
    };

    // Always persist the config first, then start/stop the bot if needed
    this.botService.saveConfig(payload).pipe(
      switchMap(() => config.isActive
        ? this.botService.startBot(payload)
        : this.botService.stopBot(market)
      ),
    ).subscribe({
      next: () => {
        this.snackBar.open('Configuration saved', 'OK', { duration: 3000 });
        this.saving = false;
      },
      error: () => { this.saving = false; },
    });
  }
}
