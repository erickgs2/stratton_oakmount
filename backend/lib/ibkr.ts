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
    this.baseUrl = process.env.IBKR_GATEWAY_URL ?? 'https://127.0.0.1:5001/v1/api';
    this.accountId = process.env.IBKR_ACCOUNT_ID ?? '';
    this.agent = new https.Agent({ rejectUnauthorized: false });
    console.log('[IBKR] init — baseUrl:', this.baseUrl, '| accountId:', this.accountId);
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

    let result = await this.request<OrderResponse>(
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
}

export const ibkrClient = new IBKRClient();
