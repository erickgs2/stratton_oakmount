jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));
jest.mock('@/lib/auth', () => ({
  ...jest.requireActual('@/lib/auth'),
  verifyPassword: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, verifyToken } from '@/lib/auth';
import { POST as login } from '../app/api/auth/login/route';
import { GET as me } from '../app/api/auth/me/route';

const USER_ROW = {
  id: 'user-1',
  email: 'trader@example.com',
  passwordHash: 'hashed',
  canEditConfig: true,
  canManualTrade: false,
};

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-value-at-least-32-bytes-long';
    jest.clearAllMocks();
  });

  it('returns a token and user on valid credentials', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(USER_ROW);
    (verifyPassword as jest.Mock).mockResolvedValue(true);

    const response = await login(postRequest({ email: 'trader@example.com', password: 'correct-password' }));
    expect(response.status).toBe(200);
    const body = await response.json() as { token: string; user: { email: string } };
    expect(body.user.email).toBe('trader@example.com');
    const decoded = await verifyToken(body.token);
    expect(decoded?.sub).toBe('user-1');
  });

  it('lowercases the email before lookup', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(USER_ROW);
    (verifyPassword as jest.Mock).mockResolvedValue(true);

    await login(postRequest({ email: 'Trader@Example.com', password: 'correct-password' }));
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'trader@example.com' } });
  });

  it('returns 401 for an unknown email', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const response = await login(postRequest({ email: 'nobody@example.com', password: 'x' }));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an incorrect password', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(USER_ROW);
    (verifyPassword as jest.Mock).mockResolvedValue(false);
    const response = await login(postRequest({ email: 'trader@example.com', password: 'wrong' }));
    expect(response.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the user derived from the trusted request headers', async () => {
    const request = new NextRequest('http://localhost/api/auth/me', {
      headers: {
        'x-user-id': 'user-1',
        'x-user-email': 'trader@example.com',
        'x-can-edit-config': 'true',
        'x-can-manual-trade': 'false',
      },
    });
    const response = await me(request);
    expect(response.status).toBe(200);
    const body = await response.json() as { id: string; email: string };
    expect(body.id).toBe('user-1');
    expect(body.email).toBe('trader@example.com');
  });

  it('returns 401 when the trusted headers are absent (should not happen behind middleware, but defends the handler)', async () => {
    const request = new NextRequest('http://localhost/api/auth/me');
    const response = await me(request);
    expect(response.status).toBe(401);
  });
});
