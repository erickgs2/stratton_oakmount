import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule, MatChipListboxChange } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BotService } from '../core/services/bot.service';
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
    MatSlideToggleModule, MatSnackBarModule,
  ],
  templateUrl: './bot-config.component.html',
  styleUrls: ['./bot-config.component.scss'],
})
export class BotConfigComponent implements OnInit {
  mxSymbols = MX_SYMBOLS;
  usaSymbols = USA_SYMBOLS;

  mxConfig: Partial<BotConfig> = { market: 'MX', symbols: ['AMXL'], capitalLimit: 10000, intervalMin: 15 };
  usaConfig: Partial<BotConfig> = { market: 'USA', symbols: ['AAPL'], capitalLimit: 1000, intervalMin: 15 };

  saving = false;

  constructor(private botService: BotService, private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    this.botService.getStatus().subscribe(configs => {
      const mx = configs.find(c => c.market === 'MX');
      const usa = configs.find(c => c.market === 'USA');
      if (mx) this.mxConfig = { ...mx };
      if (usa) this.usaConfig = { ...usa };
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
    };

    const action$: Observable<unknown> = config.isActive
      ? this.botService.startBot(payload)
      : this.botService.stopBot(market);

    action$.subscribe({
      next: () => {
        this.snackBar.open('Configuration saved', 'OK', { duration: 3000 });
        this.saving = false;
      },
      error: () => { this.saving = false; },
    });
  }
}
