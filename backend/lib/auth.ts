import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

const SALT_ROUNDS = 10;

export interface AuthTokenPayload {
  sub: string;
  email: string;
  canEditConfig: boolean;
  canManualTrade: boolean;
}

export interface AuthContext {
  userId: string;
  email: string;
  canEditConfig: boolean;
  canManualTrade: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: AuthTokenPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    canEditConfig: payload.canEditConfig,
    canManualTrade: payload.canManualTrade,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    return {
      sub: payload.sub,
      email: payload.email,
      canEditConfig: Boolean(payload.canEditConfig),
      canManualTrade: Boolean(payload.canManualTrade),
    };
  } catch {
    return null;
  }
}

// Rebuilds a Headers object with the trusted auth fields SET (overwriting,
// never trusting, any client-supplied header of the same name) — used by
// middleware.ts to pass a verified identity to route handlers without
// letting a client spoof it by sending its own x-can-edit-config header.
export function buildAuthHeaders(existingHeaders: Headers, payload: AuthTokenPayload): Headers {
  const headers = new Headers(existingHeaders);
  headers.set('x-user-id', payload.sub);
  headers.set('x-user-email', payload.email);
  headers.set('x-can-edit-config', String(payload.canEditConfig));
  headers.set('x-can-manual-trade', String(payload.canManualTrade));
  return headers;
}

export function getAuthContext(request: NextRequest): AuthContext | null {
  const userId = request.headers.get('x-user-id');
  const email = request.headers.get('x-user-email');
  if (!userId || !email) return null;
  return {
    userId,
    email,
    canEditConfig: request.headers.get('x-can-edit-config') === 'true',
    canManualTrade: request.headers.get('x-can-manual-trade') === 'true',
  };
}

export function requirePermission(
  context: AuthContext | null,
  permission: 'canEditConfig' | 'canManualTrade',
): NextResponse | null {
  if (!context || !context[permission]) {
    return NextResponse.json({ error: 'Forbidden — insufficient permission' }, { status: 403 });
  }
  return null;
}

// Used by the user-management routes to enforce that removing or demoting a
// user never leaves zero canEditConfig users in the system.
export async function hasAnotherConfigEditor(excludingUserId: string): Promise<boolean> {
  const remaining = await prisma.user.count({
    where: { canEditConfig: true, id: { not: excludingUserId } },
  });
  return remaining > 0;
}
