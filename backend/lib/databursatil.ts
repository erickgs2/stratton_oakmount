export interface MXMarketData {
  symbol: string;
  lastPrice: number;
  changePct: number;
  volume: number;
  history: { date: string; close: number; volume: number }[];
}

// GET /v2/cotizaciones → { "SYMBOL": { "bmv": { u, c, v, ... } } }
type CotizacionesResponse = Record<string, Record<string, {
  u: number;  // último precio
  c: number;  // cambio porcentual
  v: number;  // volumen operado
}>>;

// GET /v2/historicos → { "YYYY-MM-DD": [precio, importe] }
type HistoricosResponse = Record<string, [number, number]>;

const BASE_URL = 'https://api.databursatil.com/v2';

function getToken(): string {
  const token = process.env.DATABURSATIL_TOKEN;
  if (!token) throw new Error('DATABURSATIL_TOKEN environment variable is not set');
  return token;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

async function apiFetch<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const endpoint = new URL(url).pathname;
    throw new Error(`DataBursatil API error ${response.status} (${endpoint}): ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export async function getMXMarketData(symbol: string): Promise<MXMarketData> {
  const token = getToken();
  const today = new Date().toISOString().split('T')[0];
  const sixtyDaysAgo = daysAgo(60);

  // Current snapshot: latest price, day change %, and session volume
  const cotizaciones = await apiFetch<CotizacionesResponse>(
    `${BASE_URL}/cotizaciones?token=${token}&emisora_serie=${symbol}&concepto=u,c,v&bolsa=BMV`
  );

  // 60-day daily closes for technical indicators (RSI, MA, volume ratio)
  const historical = await apiFetch<HistoricosResponse>(
    `${BASE_URL}/historicos?token=${token}&emisora_serie=${symbol}&inicio=${sixtyDaysAgo}&final=${today}`
  );

  // bolsa key comes back lowercase ("bmv") regardless of how it was sent
  const symbolQuote = cotizaciones[symbol];
  const bolsaData = symbolQuote?.['bmv'] ?? symbolQuote?.['BMV'] ?? Object.values(symbolQuote ?? {})[0];

  if (!bolsaData || bolsaData.u == null) {
    throw new Error(`No quote data returned for symbol ${symbol}`);
  }

  const historyEntries = Object.entries(historical)
    .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, [precio, importe]]) => ({
      date: fecha,
      close: precio,
      volume: importe,
    }));

  return {
    symbol,
    lastPrice: bolsaData.u,
    changePct: bolsaData.c,
    volume: bolsaData.v,
    history: historyEntries,
  };
}
