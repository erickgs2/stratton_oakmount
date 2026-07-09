import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthContext, requirePermission, hashPassword } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  const users = await prisma.user.findMany({
    select: { id: true, email: true, canEditConfig: true, canManualTrade: true, createdAt: true },
  });
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  const body = await request.json() as {
    email?: string;
    password?: string;
    canEditConfig?: boolean;
    canManualTrade?: boolean;
  };
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'a user with this email already exists' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      canEditConfig: body.canEditConfig ?? false,
      canManualTrade: body.canManualTrade ?? false,
    },
    select: { id: true, email: true, canEditConfig: true, canManualTrade: true, createdAt: true },
  });
  return NextResponse.json(user, { status: 201 });
}
