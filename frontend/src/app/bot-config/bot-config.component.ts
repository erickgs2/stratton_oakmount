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

const MX_SYMBOLS = ['AMXL', 'FEMSAUBD', 'WALMEX', 'BIMBOA', 'GCARSOA1'];
const USA_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'];

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

  mxConfig: Partial<BotConfig> = {
    market: 'MX', symbols: ['AMXL'], capitalLimit: 10000, intervalMin: 15,
    confidenceThreshold: 0.65, takeProfitPct: 1.5, stopLossPct: 1.0, feeEstimatePct: 0.30,
  };
  usaConfig: Partial<BotConfig> = {
    market: 'USA', symbols: ['AAPL'], capitalLimit: 1000, intervalMin: 15,
    confidenceThreshold: 0.65, takeProfitPct: 1.5, stopLossPct: 1.0, feeEstimatePct: 0.05,
  };

  saving = false;

  ibkrAccountId = '';
  settingsSaving = false;
  loggingOut = false;

  constructor(
    private botService: BotService,
    private settingsService: SettingsService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.botService.getStatus().subscribe(response => {
      const mx = response.configs.find(c => c.market === 'MX');
      const usa = response.configs.find(c => c.market === 'USA');
      if (mx) this.mxConfig = { ...mx };
      if (usa) this.usaConfig = { ...usa };
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

  onSymbolChange(event: MatChipListboxChange, market: 'MX' | 'USA'): void {
    const selected = Array.isArray(event.value) ? event.value : [event.value];
    if (market === 'MX') this.mxConfig.symbols = selected;
    else this.usaConfig.symbols = selected;
  }

  saveConfig(market: 'MX' | 'USA'): void {
    const config = market === 'MX' ? this.mxConfig : this.usaConfig;
    this.saving = true;

    const payload = {
      market,
      symbols: config.symbols ?? [],
      capitalLimit: config.capitalLimit ?? 10000,
      intervalMin: config.intervalMin ?? 15,
      confidenceThreshold: config.confidenceThreshold ?? 0.65,
      takeProfitPct: config.takeProfitPct ?? 1.5,
      stopLossPct: config.stopLossPct ?? 1.0,
      feeEstimatePct: config.feeEstimatePct ?? (market === 'MX' ? 0.30 : 0.05),
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
