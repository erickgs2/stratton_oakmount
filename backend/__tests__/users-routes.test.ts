jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GET as listUsers, POST as createUser } from '../app/api/users/route';
import { PATCH as updateUser, DELETE as deleteUser } from '../app/api/users/[id]/route';
import { POST as resetPassword } from '../app/api/users/[id]/reset-password/route';

const EDITOR_HEADERS = {
  'x-user-id': 'editor-1',
  'x-user-email': 'editor@example.com',
  'x-can-edit-config': 'true',
  'x-can-manual-trade': 'false',
};
const VIEWER_HEADERS = {
  'x-user-id': 'viewer-1',
  'x-user-email': 'viewer@example.com',
  'x-can-edit-config': 'false',
  'x-can-manual-trade': 'false',
};

function req(url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: init.method ?? 'GET',
    headers: init.headers ?? EDITOR_HEADERS,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/users', () => {
  it('requires canEditConfig', async () => {
    const response = await listUsers(req('/api/users', { headers: VIEWER_HEADERS }));
    expect(response.status).toBe(403);
  });

  it('lists users without exposing passwordHash', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'u1', email: 'a@b.com', canEditConfig: true, canManualTrade: false, createdAt: new Date() },
    ]);
    const response = await listUsers(req('/api/users'));
    expect(response.status).toBe(200);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      select: { id: true, email: true, canEditConfig: true, canManualTrade: true, createdAt: true },
    });
  });
});

describe('POST /api/users', () => {
  it('requires canEditConfig', async () => {
    const response = await createUser(req('/api/users', {
      method: 'POST', headers: VIEWER_HEADERS,
      body: { email: 'new@example.com', password: 'longenough', canEditConfig: false, canManualTrade: false },
    }));
    expect(response.status).toBe(403);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const response = await createUser(req('/api/users', {
      method: 'POST',
      body: { email: 'new@example.com', password: 'short', canEditConfig: false, canManualTrade: false },
    }));
    expect(response.status).toBe(400);
  });

  it('rejects a duplicate email', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });
    const response = await createUser(req('/api/users', {
      method: 'POST',
      body: { email: 'dup@example.com', password: 'longenough', canEditConfig: false, canManualTrade: false },
    }));
    expect(response.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates a user with a hashed password on valid input', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({
      id: 'new1', email: 'new@example.com', canEditConfig: false, canManualTrade: true, createdAt: new Date(),
    });
    const response = await createUser(req('/api/users', {
      method: 'POST',
      body: { email: 'New@Example.com', password: 'longenough', canEditConfig: false, canManualTrade: true },
    }));
    expect(response.status).toBe(201);
    const createArgs = (prisma.user.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.email).toBe('new@example.com');
    expect(createArgs.data.passwordHash).not.toBe('longenough');
  });
});

describe('PATCH /api/users/:id', () => {
  it('requires canEditConfig', async () => {
    const response = await updateUser(
      req('/api/users/u1', { method: 'PATCH', headers: VIEWER_HEADERS, body: { canEditConfig: false } }),
      { params: { id: 'u1' } },
    );
    expect(response.status).toBe(403);
  });

  it('blocks revoking canEditConfig from the last remaining editor', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1', canEditConfig: true });
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    const response = await updateUser(
      req('/api/users/u1', { method: 'PATCH', body: { canEditConfig: false } }),
      { params: { id: 'u1' } },
    );
    expect(response.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows revoking canEditConfig when another editor remains', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1', canEditConfig: true });
    (prisma.user.count as jest.Mock).mockResolvedValue(1);
    (prisma.user.update as jest.Mock).mockResolvedValue({
      id: 'u1', email: 'a@b.com', canEditConfig: false, canManualTrade: false, createdAt: new Date(),
    });
    const response = await updateUser(
      req('/api/users/u1', { method: 'PATCH', body: { canEditConfig: false } }),
      { params: { id: 'u1' } },
    );
    expect(response.status).toBe(200);
  });
});

describe('DELETE /api/users/:id', () => {
  it('blocks deleting the last remaining editor', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1', canEditConfig: true });
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    const response = await deleteUser(req('/api/users/u1', { method: 'DELETE' }), { params: { id: 'u1' } });
    expect(response.status).toBe(400);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('deletes a non-last-editor user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1', canEditConfig: false });
    (prisma.user.delete as jest.Mock).mockResolvedValue({});
    const response = await deleteUser(req('/api/users/u1', { method: 'DELETE' }), { params: { id: 'u1' } });
    expect(response.status).toBe(200);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });
});

describe('POST /api/users/:id/reset-password', () => {
  it('rejects a password shorter than 8 characters', async () => {
    const response = await resetPassword(
      req('/api/users/u1/reset-password', { method: 'POST', body: { password: 'short' } }),
      { params: { id: 'u1' } },
    );
    expect(response.status).toBe(400);
  });

  it('hashes and saves the new password', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    const response = await resetPassword(
      req('/api/users/u1/reset-password', { method: 'POST', body: { password: 'longenough' } }),
      { params: { id: 'u1' } },
    );
    expect(response.status).toBe(200);
    const updateArgs = (prisma.user.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'u1' });
    expect(updateArgs.data.passwordHash).not.toBe('longenough');
  });
});
