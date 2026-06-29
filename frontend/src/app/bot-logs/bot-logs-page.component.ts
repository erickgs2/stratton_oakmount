import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription, interval, of } from 'rxjs';
import { startWith, switchMap, catchError } from 'rxjs/operators';
import { BotLogService } from '../core/services/bot-log.service';
import { BotLog } from '../core/models/bot-log.model';

@Component({
  selector: 'app-bot-logs-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatIconModule,
    MatButtonModule, MatChipsModule, MatProgressSpinnerModule,
  ],
  templateUrl: './bot-logs-page.component.html',
  styleUrls: ['./bot-logs-page.component.scss'],
})
const PAGE_SIZE = 50;

export class BotLogsPageComponent implements OnInit, OnDestroy {
  allLogs: BotLog[] = [];
  filteredLogs: BotLog[] = [];
  pagedLogs: BotLog[] = [];
  loading = true;

  searchTerm = '';
  activeLevel: 'all' | 'info' | 'warn' | 'error' = 'all';
  activeMarket: 'all' | 'MX' | 'USA' = 'all';

  private visibleCount = PAGE_SIZE;
  private sub = new Subscription();

  constructor(private botLogService: BotLogService) {}

  get hasMore(): boolean {
    return this.filteredLogs.length > this.visibleCount;
  }

  get shownCount(): number {
    return this.pagedLogs.length;
  }

  get totalCount(): number {
    return this.filteredLogs.length;
  }

  ngOnInit(): void {
    this.sub.add(
      interval(10_000).pipe(
        startWith(0),
        switchMap(() =>
          this.botLogService.getLogs({ limit: 500 }).pipe(
            catchError(() => of({ logs: this.allLogs }))
          )
        ),
      ).subscribe({
        next: ({ logs }) => {
          this.allLogs = logs;
          this.loading = false;
          this.applyFilters();
        },
        error: () => { this.loading = false; },
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  setLevel(level: 'all' | 'info' | 'warn' | 'error'): void {
    this.activeLevel = level;
    this.visibleCount = PAGE_SIZE;
    this.applyFilters();
  }

  setMarket(market: 'all' | 'MX' | 'USA'): void {
    this.activeMarket = market;
    this.visibleCount = PAGE_SIZE;
    this.applyFilters();
  }

  onSearchChange(): void {
    this.visibleCount = PAGE_SIZE;
    this.applyFilters();
  }

  loadMore(): void {
    this.visibleCount += PAGE_SIZE;
    this.pagedLogs = this.filteredLogs.slice(0, this.visibleCount);
  }

  applyFilters(): void {
    const term = this.searchTerm.toLowerCase();
    this.filteredLogs = this.allLogs.filter(log => {
      if (this.activeLevel !== 'all' && log.level !== this.activeLevel) return false;
      if (this.activeMarket !== 'all' && log.market !== this.activeMarket) return false;
      if (term) {
        const inMessage = log.message.toLowerCase().includes(term);
        const inSymbol = log.symbol?.toLowerCase().includes(term) ?? false;
        if (!inMessage && !inSymbol) return false;
      }
      return true;
    });
    this.pagedLogs = this.filteredLogs.slice(0, this.visibleCount);
  }

  getLevelClass(level: string): string {
    return `level-${level}`;
  }
}
