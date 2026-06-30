import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Order } from '../models/order.model';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getPendingOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.apiUrl}/orders`).pipe(
      catchError(() => of([]))
    );
  }
}
