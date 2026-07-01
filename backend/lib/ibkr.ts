import https from 'https';
import { prisma } from './prisma';

export interface IBKRPosition {
  conid: number;
  ticker: string;
  position: number;
  avgCost: number;
  mktValue: number;
  unrealizedPnl: number;
}

export interface AccountSummary {
  availableFunds: number;
  buyingPower: number;
  currency: string;
  totalCashValue: number;
  netLiquidation: number;
}

export interface PlaceOrderParams {
  conid: number;
  side: 'BUY' | 'SELL';
  quantity: number;
  market: 'MX' | 'USA';
}

export interface IBKROrder {
  orderId: number;
  ticker: string;
  side: 'BUY' | 'SELL';
  orderType: string;
  totalSize: number;
  filledQuantity: number;
  remainingQuantity: number;
  status: string;
  price?: number;
  listingExchange?: string;
  timeInForce?: string;
}

export class IBKRClient {
  private readonly baseUrl: string;
  private readonly agent: https.Agent;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private cachedAccountId: string | null = null;

  constructor() {
    this.baseUrl = process.env.IBKR_GATEWAY_URL ?? 'https://127.0.0.1:5001/v1/api';
    this.agent = new https.Agent({ rejectUnauthorized: false });
    console.log('[IBKR] init — baseUrl:', this.baseUrl);
  }

  private async resolveAccountId(): Promise<string> {
    if (this.cachedAccountId !== null) return this.cachedAccountId;
    const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
    this.cachedAccountId = settings?.ibkrAccountId || process.env.IBKR_ACCOUNT_ID || '';
    return this.cachedAccountId;
  }

  setAccountId(id: string): void {
    this.cachedAccountId = id;
  }

  private request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}${path}`);
      const bodyStr = options.body ? JSON.stringify(options.body) : undefined;

      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: options.method ?? 'GET',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'stratton-oakmont/1.0',
            'Accept': '*/*',
            ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
          },
          agent: this.agent,
        },
        res => {
          let data = '';
          res.on('data', (chunk: string) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(data) as T);
            } else {
              reject(new Error(`IBKR API error ${res.statusCode}: ${data}`));
            }
          });
        }
      );

      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  startKeepAlive(): void {
    if (this.keepAliveInterval) return;
    this.keepAliveInterval = setInterval(() => {
      this.request('/tickle').catch(err => {
        console.error('[IBKR] Keep-alive tickle failed:', (err as Error).message);
      });
    }, 55_000);
  }

  stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  async getPositions(): Promise<IBKRPosition[]> {
    const accountId = await this.resolveAccountId();
    return this.request<IBKRPosition[]>(`/portfolio/${accountId}/positions/0`);
  }

  async getAccountSummary(): Promise<AccountSummary> {
    const accountId = await this.resolveAccountId();
    const raw = await this.request<Record<string, { amount: number; currency: string }>>(
      `/portfolio/${accountId}/summary`
    );
    return {
      availableFunds: raw['availablefunds']?.amount ?? 0,
      buyingPower: raw['buyingpower']?.amount ?? 0,
      currency: raw['availablefunds']?.currency ?? 'USD',
      totalCashValue: raw['totalcashvalue']?.amount ?? 0,
      netLiquidation: raw['netliquidation']?.amount ?? 0,
    };
  }

  async searchConid(symbol: string, exchange: string): Promise<number | null> {
    try {
      const results = await this.request<Array<{
        conid: number | string;
        sections?: Array<{ secType: string; exchange?: string }>;
      }>>(`/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}&name=false&secType=STK`);

      if (!results?.length) return null;

      // Prefer the contract listed on the target exchange; fall back to first result
      const match =
        results.find(r => r.sections?.some(s => s.exchange === exchange)) ??
        results[0];

      const id = typeof match.conid === 'string' ? parseInt(match.conid, 10) : match.conid;
      return isNaN(id) ? null : id;
    } catch {
      return null;
    }
  }

  async placeOrder(params: PlaceOrderParams): Promise<string> {
    type OrderResponse = Array<{
      order_id?: number;
      id?: string;
      message?: string[];
      isSuppressed?: boolean;
    }>;

    const accountId = await this.resolveAccountId();

    let result = await this.request<OrderResponse>(
      `/iserver/account/${accountId}/orders`,
      {
        method: 'POST',
        body: {
          orders: [
            {
              acctId: accountId,
              conid: params.conid,
              orderType: 'MKT',
              side: params.side,
              quantity: params.quantity,
              tif: 'DAY',
              exchange: params.market === 'MX' ? 'BMV' : 'SMART',
              currency: params.market === 'MX' ? 'MXN' : 'USD',
            },
          ],
        },
      }
    );

    // IBKR may return a confirmation request instead of an order_id.
    // Auto-confirm up to 3 rounds to handle chained warning prompts.
    for (let i = 0; i < 3; i++) {
      const first = result[0];
      if (!first || first.order_id != null) break;
      if (!first.id) break;
      result = await this.request<OrderResponse>(
        `/iserver/reply/${first.id}`,
        { method: 'POST', body: { confirmed: true } }
      );
    }

    return result[0]?.order_id?.toString() ?? '';
  }

  async getOrders(): Promise<IBKROrder[]> {
    type RawOrder = {
      orderId?: number;
      ticker?: string;
      side?: string;
      orderType?: string;
      origOrderType?: string;
      totalSize?: number;
      filledQuantity?: number;
      remainingQuantity?: number;
      status?: string;
      price?: string | number;
      listingExchange?: string;
      timeInForce?: string;
    };
    try {
      const result = await this.request<{ orders?: RawOrder[] }>('/iserver/account/orders');
      return (result.orders ?? []).map(o => ({
        orderId: o.orderId ?? 0,
        ticker: o.ticker ?? '',
        side: (o.side?.toUpperCase() as 'BUY' | 'SELL') ?? 'BUY',
        orderType: o.origOrderType ?? o.orderType ?? 'MKT',
        totalSize: o.totalSize ?? 0,
        filledQuantity: o.filledQuantity ?? 0,
        remainingQuantity: o.remainingQuantity ?? 0,
        status: o.status ?? 'Unknown',
        price: o.price != null ? Number(o.price) : undefined,
        listingExchange: o.listingExchange,
        timeInForce: o.timeInForce,
      }));
    } catch {
      return [];
    }
  }

  async checkAuthStatus(): Promise<boolean> {
    // 5-second timeout: if the gateway doesn't respond, treat as disconnected
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<false>(resolve => {
      timer = setTimeout(() => resolve(false), 5_000);
    });
    const check = this.request<{ authenticated?: boolean; connected?: boolean }>(
      '/iserver/auth/status'
    )
      .then(data => data.authenticated === true && data.connected === true)
      .catch(() => false);
    const result = await Promise.race([check, timeout]);
    clearTimeout(timer!);
    return result;
  }

  async logout(): Promise<void> {
    await this.request('/logout', { method: 'POST' });
  }
}

export const ibkrClient = new IBKRClient();
