import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { Subscription, interval, of } from 'rxjs';
import { startWith, switchMap, catchError } from 'rxjs/operators';
import { BotService } from '../core/services/bot.service';
import { AgentLogComponent } from '../agent-log/agent-log.component';

@Component({
  selector: 'app-agent-logs-page',
  standalone: true,
  imports: [CommonModule, MatChipsModule, AgentLogComponent],
  templateUrl: './agent-logs-page.component.html',
  styleUrls: ['./agent-logs-page.component.scss'],
})
export class AgentLogsPageComponent implements OnInit, OnDestroy {
  activeMarket: 'MX' | 'USA' = 'MX';
  isRunning = false;

  private sub = new Subscription();

  constructor(private botService: BotService) {}

  ngOnInit(): void {
    this.sub.add(
      interval(60_000).pipe(
        startWith(0),
        switchMap(() =>
          this.botService.getStatus().pipe(catchError(() => of(null)))
        ),
      ).subscribe(result => {
        if (result) {
          this.isRunning = result.configs.find(c => c.market === this.activeMarket)?.isActive ?? false;
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  setMarket(market: 'MX' | 'USA'): void {
    this.activeMarket = market;
    this.loadStatus();
  }

  private loadStatus(): void {
    this.sub.add(
      this.botService.getStatus().pipe(catchError(() => of(null))).subscribe(result => {
        if (result) {
          this.isRunning = result.configs.find(c => c.market === this.activeMarket)?.isActive ?? false;
        }
      })
    );
  }
}
