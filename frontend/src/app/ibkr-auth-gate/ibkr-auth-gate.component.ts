import { Component, inject } from '@angular/core';
import { NgIf, AsyncPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { IbkrAuthService } from '../core/services/ibkr-auth.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-ibkr-auth-gate',
  standalone: true,
  imports: [NgIf, AsyncPipe, MatIconModule, MatButtonModule],
  templateUrl: './ibkr-auth-gate.component.html',
  styleUrl: './ibkr-auth-gate.component.scss',
})
export class IbkrAuthGateComponent {
  protected connected$ = inject(IbkrAuthService).connected$;

  openLogin(): void {
    window.open(environment.gatewayLoginUrl, '_blank');
  }
}
