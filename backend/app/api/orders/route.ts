import { NextResponse } from 'next/server';
import { ibkrClient } from '@/lib/ibkr';

export const dynamic = 'force-dynamic';

const PENDING_STATUSES = new Set([
  'PendingSubmit', 'PreSubmitted', 'Submitted', 'PartiallyFilled', 'PendingCancel',
]);

export async function GET() {
  try {
    const orders = await ibkrClient.getOrders();
    const pending = orders.filter(o => PENDING_STATUSES.has(o.status));
    return NextResponse.json(pending);
  } catch (error) {
    const msg = (error as Error).message;
    console.error('[orders]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
