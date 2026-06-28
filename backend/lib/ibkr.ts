import https from 'https';

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

export class IBKRClient {
  private readonly baseUrl: string;
  private readonly accountId: string;
  private readonly agent: https.Agent;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.baseUrl = process.env.IBKR_GATEWAY_URL ?? 'https://localhost:5000/v1/api';
    this.accountId = process.env.IBKR_ACCOUNT_ID ?? '';
    // IBKR Client Portal uses a self-signed certificate on localhost
    this.agent = new https.Agent({ rejectUnauthorized: false });
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
    return this.request<IBKRPosition[]>(`/portfolio/${this.accountId}/positions/0`);
  }

  async getAccountSummary(): Promise<AccountSummary> {
    const raw = await this.request<Record<string, { amount: number; currency: string }>>(
      `/portfolio/${this.accountId}/summary`
    );
    return {
      availableFunds: raw['availablefunds']?.amount ?? 0,
      buyingPower: raw['buyingpower']?.amount ?? 0,
      currency: raw['availablefunds']?.currency ?? 'USD',
      totalCashValue: raw['totalcashvalue']?.amount ?? 0,
      netLiquidation: raw['netliquidation']?.amount ?? 0,
    };
  }

  async placeOrder(params: PlaceOrderParams): Promise<string> {
    const result = await this.request<{ orderId: string }[]>(
      `/iserver/account/${this.accountId}/orders`,
      {
        method: 'POST',
        body: {
          orders: [
            {
              acctId: this.accountId,
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
    return result[0]?.orderId ?? '';
  }
}

export const ibkrClient = new IBKRClient();
