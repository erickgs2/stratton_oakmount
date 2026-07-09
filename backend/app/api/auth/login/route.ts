import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, signToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const body = await request.json() as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const token = await signToken({
    sub: user.id,
    email: user.email,
    canEditConfig: user.canEditConfig,
    canManualTrade: user.canManualTrade,
  });

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      canEditConfig: user.canEditConfig,
      canManualTrade: user.canManualTrade,
    },
  });
}
