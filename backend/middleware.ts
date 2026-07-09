import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, buildAuthHeaders } from '@/lib/auth';

export const config = {
  matcher: '/api/:path*',
};

const PUBLIC_PATHS = ['/api/auth/login'];

export async function middleware(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.includes(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next({
    request: { headers: buildAuthHeaders(request.headers, payload) },
  });
}
