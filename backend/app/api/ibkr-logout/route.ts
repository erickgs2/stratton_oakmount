import { NextResponse } from 'next/server';
import { ibkrClient } from '@/lib/ibkr';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await ibkrClient.logout();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false });
  }
}
