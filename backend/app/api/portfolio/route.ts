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
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
