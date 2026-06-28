export interface MXMarketData {
  symbol: string;
  lastPrice: number;
  changePct: number;
  volume: number;
  history: { date: string; close: number; volume: number }[];
}

interface IntradayRecord {
  EmisioraSerie: string;
  UltimoPrecio: number;
  PorcentajeCambio: number;
  Volumen: number;
}

interface HistoricalRecord {
  Fecha: string;
  UltimoPrecio: number;
  Volumen: number;
}

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
    throw new Error(`DataBursatil API error ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export async function getMXMarketData(symbol: string): Promise<MXMarketData> {
  const token = getToken();
  const today = new Date().toISOString().split('T')[0];
  const sixtyDaysAgo = daysAgo(60);

  const [intraday, historical] = await Promise.all([
    apiFetch<{ Serie: IntradayRecord[] }>(
      `${BASE_URL}/intradia?token=${token}&emisora_serie=${symbol}&bolsa=BMV,BIVA`
    ),
    apiFetch<{ Serie: HistoricalRecord[] }>(
      `${BASE_URL}/historico?token=${token}&emisora_serie=${symbol}&periodo=diaria&desde=${sixtyDaysAgo}&hasta=${today}`
    ),
  ]);

  const latest = intraday.Serie[0];
  if (!latest) throw new Error(`No intraday data returned for symbol ${symbol}`);

  return {
    symbol,
    lastPrice: latest.UltimoPrecio,
    changePct: latest.PorcentajeCambio,
    volume: latest.Volumen,
    history: historical.Serie.map(r => ({
      date: r.Fecha,
      close: r.UltimoPrecio,
      volume: r.Volumen,
    })),
  };
}
