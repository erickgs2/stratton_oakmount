import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CryptoPortfolio } from '../models/crypto-portfolio.model';

@Injectable({ providedIn: 'root' })
export class CryptoPortfolioService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getPortfolio(): Observable<CryptoPortfolio> {
    return this.http.get<CryptoPortfolio>(`${this.apiUrl}/portfolio/crypto`);
  }
}
