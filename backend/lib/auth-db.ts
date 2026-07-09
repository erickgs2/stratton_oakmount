import { prisma } from '@/lib/prisma';

// Used by the user-management routes to enforce that removing or demoting a
// user never leaves zero canEditConfig users in the system.
//
// Deliberately kept out of lib/auth.ts: that file is imported by
// middleware.ts, which Next.js bundles for the Edge runtime. Prisma's
// pg/@prisma/adapter-pg driver requires Node.js's `crypto` module, which
// the Edge runtime doesn't provide — pulling prisma into lib/auth.ts once
// broke every request through the middleware (500 on every /api/* route,
// including /api/auth/login) even though middleware.ts itself never calls
// this function. Route handlers run in the Node.js runtime, so importing
// prisma here is safe.
export async function hasAnotherConfigEditor(excludingUserId: string): Promise<boolean> {
  const remaining = await prisma.user.count({
    where: { canEditConfig: true, id: { not: excludingUserId } },
  });
  return remaining > 0;
}
