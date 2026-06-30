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

  async openLogin(): Promise<void> {
    const url = environment.gatewayLoginUrl;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor as { isNativePlatform: () => boolean } | undefined;
    if (cap?.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
    } else {
      window.open(url, '_blank');
    }
  }
}
