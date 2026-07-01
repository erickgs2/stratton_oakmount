import { ibkrClient } from './ibkr';
import { MXMarketData } from './databursatil';

const conidCache = new Map<string, number>();

async function resolveConid(symbol: string): Promise<number> {
  const cached = conidCache.get(symbol);
  if (cached !== undefined) return cached;

  const conid = await ibkrClient.searchConid(symbol, 'SMART');
  if (conid === null) {
    throw new Error(`No conid found for symbol ${symbol}`);
  }

  conidCache.set(symbol, conid);
  return conid;
}

export async function getUSAMarketData(symbol: string): Promise<MXMarketData> {
  const conid = await resolveConid(symbol);

  const [snapshot, history] = await Promise.all([
    ibkrClient.getMarketDataSnapshot(conid),
    ibkrClient.getMarketDataHistory(conid),
  ]);

  if (!snapshot) {
    throw new Error(`No quote data returned for symbol ${symbol}`);
  }

  return {
    symbol,
    lastPrice: snapshot.lastPrice,
    changePct: snapshot.changePct,
    volume: snapshot.volume,
    history,
  };
}
