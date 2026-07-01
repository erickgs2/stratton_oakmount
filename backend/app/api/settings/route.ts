import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ibkrClient } from '@/lib/ibkr';

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  return NextResponse.json({ ibkrAccountId: settings?.ibkrAccountId ?? null });
}

export async function PUT(request: NextRequest) {
  const body = await request.json() as { ibkrAccountId: string };
  const { ibkrAccountId } = body;

  await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ibkrAccountId },
    update: { ibkrAccountId },
  });
  ibkrClient.setAccountId(ibkrAccountId);

  return NextResponse.json({ status: 'saved', ibkrAccountId });
}
