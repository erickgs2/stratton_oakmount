import { NextRequest, NextResponse } from 'next/server';
import { previewAgentRequest } from '@/lib/claude-agent';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market');

  if (market !== 'MX' && market !== 'USA' && market !== 'CRYPTO') {
    return NextResponse.json({ error: 'market query param must be MX, USA, or CRYPTO' }, { status: 400 });
  }

  try {
    const preview = await previewAgentRequest(market);
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
