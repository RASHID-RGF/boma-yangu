import prisma from '@/lib/db/prisma';

/**
 * Returns the Tenant record linked to a user account (or null).
 * A TENANT-role user is scoped to the data of this tenant record.
 */
export async function getTenantRecord(userId: string) {
  return prisma.tenant.findFirst({
    where: { userId },
    include: {
      unit: { include: { property: true } },
      lease: true,
    },
  });
}
