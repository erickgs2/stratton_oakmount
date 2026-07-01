import { NextRequest, NextResponse } from 'next/server';
import { getUSAMarketData } from '@/lib/ibkr-market-data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'symbol query param is required' }, { status: 400 });
  }

  try {
    const data = await getUSAMarketData(symbol);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
