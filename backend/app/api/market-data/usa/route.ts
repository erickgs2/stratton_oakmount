import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { error: 'USA market data (Phase 2) not yet implemented' },
    { status: 501 }
  );
}
