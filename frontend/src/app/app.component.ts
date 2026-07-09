import { Component, OnInit, ViewChild } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { IbkrAuthService } from './core/services/ibkr-auth.service';
import { AuthService, AuthUser } from './core/services/auth.service';
import { IbkrAuthGateComponent } from './ibkr-auth-gate/ibkr-auth-gate.component';
import { MobileGestureDirective } from './shared/mobile-gesture.directive';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet, RouterLink, RouterLinkActive,
    MatSidenavModule, MatToolbarModule, MatListModule,
    MatIconModule, MatButtonModule, MatProgressSpinnerModule,
    MatTooltipModule,
    IbkrAuthGateComponent,
    MobileGestureDirective,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'Stratton Oakmont';
  isMobile = false;
  pullDistance = 0;
  readonly pullThreshold = 70;

  @ViewChild('sidenav') sidenav!: MatSidenav;

  protected ibkrConnected$: Observable<boolean>;
  protected currentUser$: Observable<AuthUser | null>;

  constructor(
    private breakpointObserver: BreakpointObserver,
    private router: Router,
    private ibkrAuthService: IbkrAuthService,
    private authService: AuthService,
  ) {
    this.ibkrConnected$ = this.ibkrAuthService.connected$;
    this.currentUser$ = this.authService.currentUser$;
  }

  ngOnInit(): void {
    this.breakpointObserver.observe('(max-width: 768px)').subscribe(result => {
      this.isMobile = result.matches;
    });
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      if (this.isMobile && this.sidenav?.opened) {
        this.sidenav.close();
      }
    });
    this.ibkrAuthService.startPolling();
    this.authService.restoreSession().subscribe();
  }

  onPullChange(px: number): void {
    this.pullDistance = px;
  }

  onRefresh(): void {
    window.location.reload();
  }

  onSwipeOpen(): void {
    if (this.isMobile && !this.sidenav.opened) {
      this.sidenav.open();
    }
  }

  openIbkrLogin(): void {
    this.ibkrAuthService.openLoginModal();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }

  hasPermission(permission: 'canEditConfig' | 'canManualTrade'): boolean {
    return this.authService.hasPermission(permission);
  }
}
