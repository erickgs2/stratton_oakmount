import { NextRequest, NextResponse } from 'next/server';
import { getPnlReport } from '@/lib/pnl';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market');
  if (market !== 'MX' && market !== 'USA' && market !== 'CRYPTO') {
    return NextResponse.json({ error: 'market must be "MX", "USA", or "CRYPTO"' }, { status: 400 });
  }

  const report = await getPnlReport(market);
  return NextResponse.json(report);
}
