import { Component, OnInit, inject } from '@angular/core';
import { NgIf, AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { IbkrAuthService } from '../core/services/ibkr-auth.service';
import { SettingsService } from '../core/services/settings.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-ibkr-auth-gate',
  standalone: true,
  imports: [
    NgIf, AsyncPipe, FormsModule,
    MatIconModule, MatButtonModule, MatRadioModule,
    MatFormFieldModule, MatInputModule,
  ],
  templateUrl: './ibkr-auth-gate.component.html',
  styleUrl: './ibkr-auth-gate.component.scss',
})
export class IbkrAuthGateComponent implements OnInit {
  protected connected$ = inject(IbkrAuthService).connected$;
  private settingsService = inject(SettingsService);

  configuredAccountId: string | null = null;
  accountChoice: 'keep' | 'change' = 'keep';
  newAccountId = '';
  loggingOut = false;
  logoutMessage = '';

  ngOnInit(): void {
    this.settingsService.getSettings().subscribe(settings => {
      this.configuredAccountId = settings.ibkrAccountId;
      this.accountChoice = settings.ibkrAccountId ? 'keep' : 'change';
    });
  }

  get canLogin(): boolean {
    if (this.accountChoice === 'keep') return !!this.configuredAccountId;
    return this.newAccountId.trim().length > 0;
  }

  async openLogin(): Promise<void> {
    if (!this.canLogin) return;

    if (this.accountChoice === 'change') {
      await new Promise<void>((resolve, reject) => {
        this.settingsService.updateSettings(this.newAccountId.trim()).subscribe({
          next: () => resolve(),
          error: (err) => reject(err),
        });
      });
      this.configuredAccountId = this.newAccountId.trim();
      this.accountChoice = 'keep';
    }

    const url = environment.gatewayLoginUrl;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor as { isNativePlatform: () => boolean } | undefined;
    if (cap?.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }

  logoutOfGateway(): void {
    if (!confirm('Log out of the IBKR gateway? This can clear a stuck session if login keeps failing.')) {
      return;
    }
    this.loggingOut = true;
    this.logoutMessage = '';
    this.settingsService.logout().subscribe({
      next: (result) => {
        this.logoutMessage = result.success
          ? 'Logged out of the IBKR gateway.'
          : 'Logout request sent (gateway may already be disconnected).';
        this.loggingOut = false;
      },
      error: () => {
        this.logoutMessage = 'Logout request failed — check your connection and try again.';
        this.loggingOut = false;
      },
    });
  }
}
