import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'trade-log',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./trade-log/trade-log.component').then(m => m.TradeLogComponent),
  },
  {
    path: 'bot-config',
    canActivate: [authGuard],
    data: { requiresPermission: 'canEditConfig' },
    loadComponent: () =>
      import('./bot-config/bot-config.component').then(m => m.BotConfigComponent),
  },
  {
    path: 'bot-logs',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./bot-logs/bot-logs-page.component').then(m => m.BotLogsPageComponent),
  },
  {
    path: 'agent-logs',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./agent-logs/agent-logs-page.component').then(m => m.AgentLogsPageComponent),
  },
  {
    path: 'pnl-history',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pnl-history/pnl-history.component').then(m => m.PnlHistoryComponent),
  },
];
