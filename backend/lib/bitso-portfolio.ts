import { bitsoClient } from '@/lib/bitso';

export interface CryptoPosition {
  book: string;
  baseCurrency: string;
  quantity: number;
  lastPrice: number;
  mktValue: number;
}

export interface CryptoPortfolio {
  currency: 'MXN';
  availableFunds: number;
  netLiquidation: number;
  positions: CryptoPosition[];
}

// getBalances() is the only authenticated Bitso call here (single nonce,
// no concurrency risk); getTicker() per symbol is unauthenticated and safe
// to run in parallel. Does not compute cost basis/unrealized P&L — that
// requires the FIFO trade-history walk already used internally by
// crypto-agent.ts's computeAvgCostFromTrades, which is out of scope for a
// simple balances summary.
export async function getCryptoPortfolio(symbols: string[]): Promise<CryptoPortfolio> {
  const [balances, tickers] = await Promise.all([
    bitsoClient.getBalances(),
    Promise.all(symbols.map(book => bitsoClient.getTicker(book))),
  ]);

  const mxnBalance = balances.find(b => b.currency === 'mxn');
  const availableFunds = mxnBalance?.available ?? 0;

  const positions: CryptoPosition[] = symbols.map((book, i) => {
    const baseCurrency = book.split('_')[0];
    const balance = balances.find(b => b.currency === baseCurrency);
    const quantity = balance?.total ?? 0;
    const lastPrice = tickers[i].last;
    return { book, baseCurrency, quantity, lastPrice, mktValue: quantity * lastPrice };
  });

  const netLiquidation = availableFunds + positions.reduce((sum, p) => sum + p.mktValue, 0);

  return { currency: 'MXN', availableFunds, netLiquidation, positions };
}
