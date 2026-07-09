import { NextRequest, NextResponse } from 'next/server';
import { ibkrClient } from '@/lib/ibkr';
import { getAuthContext, requirePermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  try {
    await ibkrClient.logout();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[ibkr-logout] logout failed:', err);
    return NextResponse.json({ success: false });
  }
}
