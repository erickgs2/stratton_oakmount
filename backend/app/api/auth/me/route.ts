import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const ctx = getAuthContext(request);
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    id: ctx.userId,
    email: ctx.email,
    canEditConfig: ctx.canEditConfig,
    canManualTrade: ctx.canManualTrade,
  });
}
