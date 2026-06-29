import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'trade-log',
    loadComponent: () =>
      import('./trade-log/trade-log.component').then(m => m.TradeLogComponent),
  },
  {
    path: 'bot-config',
    loadComponent: () =>
      import('./bot-config/bot-config.component').then(m => m.BotConfigComponent),
  },
  {
    path: 'bot-logs',
    loadComponent: () =>
      import('./bot-logs/bot-logs-page.component').then(m => m.BotLogsPageComponent),
  },
];
