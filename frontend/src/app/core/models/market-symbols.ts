import { Market } from './market.model';

export const MX_SYMBOLS = ['AMXL', 'FEMSAUBD', 'WALMEX', 'BIMBOA', 'GCARSOA1'];
export const USA_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'];
export const CRYPTO_SYMBOLS = ['btc_mxn', 'eth_mxn', 'usdt_mxn'];

export function symbolsForMarket(market: Market): string[] {
  if (market === 'MX') return MX_SYMBOLS;
  if (market === 'USA') return USA_SYMBOLS;
  return CRYPTO_SYMBOLS;
}
