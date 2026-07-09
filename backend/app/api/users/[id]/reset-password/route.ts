import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthContext, requirePermission, hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  const body = await request.json() as { password?: string };
  if (!body.password || body.password.length < 8) {
    return NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 });
  }

  const passwordHash = await hashPassword(body.password);
  await prisma.user.update({ where: { id: params.id }, data: { passwordHash } });
  return NextResponse.json({ status: 'password updated' });
}
