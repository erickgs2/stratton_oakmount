import { Component, OnInit, ViewChild } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { IbkrAuthService } from './core/services/ibkr-auth.service';
import { IbkrAuthGateComponent } from './ibkr-auth-gate/ibkr-auth-gate.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet, RouterLink, RouterLinkActive,
    MatSidenavModule, MatToolbarModule, MatListModule,
    MatIconModule, MatButtonModule,
    IbkrAuthGateComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'Stratton Oakmont';
  isMobile = false;

  @ViewChild('sidenav') sidenav!: MatSidenav;

  constructor(
    private breakpointObserver: BreakpointObserver,
    private router: Router,
    private ibkrAuthService: IbkrAuthService,
  ) {}

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
  }
}
