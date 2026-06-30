import { NextResponse } from 'next/server';
import { ibkrClient } from '@/lib/ibkr';

export const dynamic = 'force-dynamic';

export async function GET() {
  const connected = await ibkrClient.checkAuthStatus();
  return NextResponse.json({ connected });
}
