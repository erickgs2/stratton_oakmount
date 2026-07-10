import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, requirePermission } from '@/lib/auth';
import { executeManualTrade } from '@/lib/manual-trade';
import { Market } from '@/lib/market';

export async function POST(request: NextRequest) {
  const context = getAuthContext(request);
  const denied = requirePermission(context, 'canManualTrade');
  if (denied) return denied;

  const body = await request.json() as {
    market?: Market;
    symbol?: string;
    side?: 'buy' | 'sell';
    quantity?: number;
    mxnAmount?: number;
  };

  if (!body.market || !body.symbol || (body.side !== 'buy' && body.side !== 'sell')) {
    return NextResponse.json({ error: 'market, symbol, and side ("buy"|"sell") are required' }, { status: 400 });
  }

  let result;
  try {
    result = await executeManualTrade({
      market: body.market,
      symbol: body.symbol,
      side: body.side,
      quantity: body.quantity,
      mxnAmount: body.mxnAmount,
      // requirePermission already returned above if context were null, so
      // this is guaranteed non-null here — TS can't see that control-flow
      // link across the two calls, hence the assertion.
      placedByEmail: context!.email,
    });
  } catch (err) {
    console.error('[manual-trade] unexpected error in executeManualTrade:', err);
    return NextResponse.json({ error: 'An unexpected error occurred, please try again' }, { status: 500 });
  }

  if (!result.success) {
    const status = result.errorType === 'broker_rejected' ? 502 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ trade: result.trade });
}
