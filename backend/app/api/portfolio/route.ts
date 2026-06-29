import { NextResponse } from 'next/server';
import { ibkrClient } from '@/lib/ibkr';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [positions, summary] = await Promise.all([
      ibkrClient.getPositions(),
      ibkrClient.getAccountSummary(),
    ]);
    return NextResponse.json({ positions, summary });
  } catch (error) {
    const msg = (error as Error).message;
    console.error('[portfolio]', msg, '| account:', process.env.IBKR_ACCOUNT_ID, '| gateway:', process.env.IBKR_GATEWAY_URL);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
