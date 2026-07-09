import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthContext, requirePermission, hasAnotherConfigEditor } from '@/lib/auth';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  const body = await request.json() as { email?: string; canEditConfig?: boolean; canManualTrade?: boolean };
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 });
  }

  if (body.canEditConfig === false && target.canEditConfig) {
    if (!(await hasAnotherConfigEditor(params.id))) {
      return NextResponse.json(
        { error: 'cannot remove the last remaining user with Edit Configuration access' },
        { status: 400 },
      );
    }
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(body.email !== undefined ? { email: body.email.trim().toLowerCase() } : {}),
      ...(body.canEditConfig !== undefined ? { canEditConfig: body.canEditConfig } : {}),
      ...(body.canManualTrade !== undefined ? { canManualTrade: body.canManualTrade } : {}),
    },
    select: { id: true, email: true, canEditConfig: true, canManualTrade: true, createdAt: true },
  });
  return NextResponse.json(user);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = requirePermission(getAuthContext(request), 'canEditConfig');
  if (denied) return denied;

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 });
  }

  if (target.canEditConfig && !(await hasAnotherConfigEditor(params.id))) {
    return NextResponse.json(
      { error: 'cannot delete the last remaining user with Edit Configuration access' },
      { status: 400 },
    );
  }

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ status: 'deleted' });
}
