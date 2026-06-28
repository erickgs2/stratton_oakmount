import { NextRequest, NextResponse } from 'next/server';
import { runAgentCycle } from '@/lib/claude-agent';

export async function POST(request: NextRequest) {
  const body = await request.json() as { symbol: string; market: 'MX' | 'USA' };
  const { symbol, market } = body;

  if (!symbol || !market) {
    return NextResponse.json({ error: 'symbol and market are required' }, { status: 400 });
  }

  try {
    const result = await runAgentCycle(symbol, market);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
