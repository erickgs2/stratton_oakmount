import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then(m => m.LoginComponent),
  },
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
  {
    path: 'agent-logs',
    loadComponent: () =>
      import('./agent-logs/agent-logs-page.component').then(m => m.AgentLogsPageComponent),
  },
  {
    path: 'pnl-history',
    loadComponent: () =>
      import('./pnl-history/pnl-history.component').then(m => m.PnlHistoryComponent),
  },
];
