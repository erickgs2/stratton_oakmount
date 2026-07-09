jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      count: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { hasAnotherConfigEditor } from '@/lib/auth-db';

describe('hasAnotherConfigEditor', () => {
  it('returns true when another canEditConfig user exists', async () => {
    (prisma.user.count as jest.Mock).mockResolvedValue(1);
    expect(await hasAnotherConfigEditor('user-1')).toBe(true);
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { canEditConfig: true, id: { not: 'user-1' } },
    });
  });

  it('returns false when no other canEditConfig user exists', async () => {
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    expect(await hasAnotherConfigEditor('user-1')).toBe(false);
  });
});
