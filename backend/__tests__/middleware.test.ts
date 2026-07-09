import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { signToken } from '@/lib/auth';

describe('middleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-value-at-least-32-bytes-long';
  });

  it('allows /api/auth/login through without a token', async () => {
    const request = new NextRequest('http://localhost/api/auth/login', { method: 'POST' });
    const response = await middleware(request);
    expect(response.status).toBe(200);
  });

  it('returns 401 when no Authorization header is present', async () => {
    const request = new NextRequest('http://localhost/api/bot/status');
    const response = await middleware(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 for a malformed bearer token', async () => {
    const request = new NextRequest('http://localhost/api/bot/status', {
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    const response = await middleware(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 when the Authorization header has no Bearer prefix', async () => {
    const token = await signToken({ sub: 'u1', email: 'a@b.com', canEditConfig: false, canManualTrade: false });
    const request = new NextRequest('http://localhost/api/bot/status', {
      headers: { authorization: token },
    });
    const response = await middleware(request);
    expect(response.status).toBe(401);
  });

  it('allows an OPTIONS preflight request through without a token', async () => {
    const request = new NextRequest('http://localhost/api/bot/status', { method: 'OPTIONS' });
    const response = await middleware(request);
    expect(response.status).toBe(200);
  });

  it('allows the request through for a valid token', async () => {
    const token = await signToken({ sub: 'u1', email: 'a@b.com', canEditConfig: true, canManualTrade: false });
    const request = new NextRequest('http://localhost/api/bot/status', {
      headers: { authorization: `Bearer ${token}` },
    });
    const response = await middleware(request);
    expect(response.status).toBe(200);
  });
});
