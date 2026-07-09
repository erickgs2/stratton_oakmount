import { NextRequest } from 'next/server';
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  buildAuthHeaders,
  getAuthContext,
  requirePermission,
  AuthTokenPayload,
} from '@/lib/auth';

const PAYLOAD: AuthTokenPayload = {
  sub: 'user-1',
  email: 'trader@example.com',
  canEditConfig: true,
  canManualTrade: false,
};

describe('hashPassword / verifyPassword', () => {
  it('round-trips a password correctly', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});

describe('signToken / verifyToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-value-at-least-32-bytes-long';
  });

  it('round-trips a payload correctly', async () => {
    const token = await signToken(PAYLOAD);
    const decoded = await verifyToken(token);
    expect(decoded).toEqual(PAYLOAD);
  });

  it('returns null for a malformed token', async () => {
    expect(await verifyToken('not-a-real-token')).toBeNull();
  });

  it('returns null for a token signed with a different secret', async () => {
    const token = await signToken(PAYLOAD);
    process.env.JWT_SECRET = 'a-completely-different-secret-value-32b';
    expect(await verifyToken(token)).toBeNull();
  });

  it('throws if JWT_SECRET is not set', async () => {
    delete process.env.JWT_SECRET;
    await expect(signToken(PAYLOAD)).rejects.toThrow('JWT_SECRET');
  });
});

describe('buildAuthHeaders', () => {
  it('sets the trusted headers from the payload', () => {
    const result = buildAuthHeaders(new Headers(), PAYLOAD);
    expect(result.get('x-user-id')).toBe('user-1');
    expect(result.get('x-user-email')).toBe('trader@example.com');
    expect(result.get('x-can-edit-config')).toBe('true');
    expect(result.get('x-can-manual-trade')).toBe('false');
  });

  it('overwrites a client-supplied header of the same name instead of trusting it', () => {
    const incoming = new Headers({ 'x-can-edit-config': 'true' });
    const result = buildAuthHeaders(incoming, { ...PAYLOAD, canEditConfig: false });
    expect(result.get('x-can-edit-config')).toBe('false');
  });

  it('preserves unrelated existing headers', () => {
    const incoming = new Headers({ 'content-type': 'application/json' });
    const result = buildAuthHeaders(incoming, PAYLOAD);
    expect(result.get('content-type')).toBe('application/json');
  });
});

describe('getAuthContext', () => {
  it('returns null when the trusted headers are absent', () => {
    const request = new NextRequest('http://localhost/api/bot/status');
    expect(getAuthContext(request)).toBeNull();
  });

  it('parses a fully-populated set of trusted headers', () => {
    const request = new NextRequest('http://localhost/api/bot/status', {
      headers: {
        'x-user-id': 'user-1',
        'x-user-email': 'trader@example.com',
        'x-can-edit-config': 'true',
        'x-can-manual-trade': 'false',
      },
    });
    expect(getAuthContext(request)).toEqual({
      userId: 'user-1',
      email: 'trader@example.com',
      canEditConfig: true,
      canManualTrade: false,
    });
  });
});

describe('requirePermission', () => {
  const allowed = { userId: 'u1', email: 'a@b.com', canEditConfig: true, canManualTrade: false };
  const denied = { userId: 'u2', email: 'c@d.com', canEditConfig: false, canManualTrade: false };

  it('returns null when the context has the required permission', () => {
    expect(requirePermission(allowed, 'canEditConfig')).toBeNull();
  });

  it('returns a 403 response when the context lacks the required permission', async () => {
    const response = requirePermission(denied, 'canEditConfig');
    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);
  });

  it('returns a 403 response when there is no context at all', () => {
    const response = requirePermission(null, 'canEditConfig');
    expect(response!.status).toBe(403);
  });
});
