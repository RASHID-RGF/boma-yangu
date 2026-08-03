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

/**
 * Returns the Tenant record linked to a user account — creating one from the
 * user's profile if none exists yet. This "self-heals" accounts registered via
 * the public sign-up form, which previously had no linked Tenant record and
 * were blocked from paying / using the tenant sections.
 */
export async function ensureTenantRecord(userId: string) {
  const existing = await getTenantRecord(userId);
  if (existing) return existing;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  // Only TENANT-role users get an auto-created profile — caretakers and other
  // non-management roles must never silently receive a Tenant record.
  if (!user || user.role !== 'TENANT') return null;

  return prisma.tenant.create({
    data: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || '',
      isActive: true,
      userId: user.id,
    },
    include: {
      unit: { include: { property: true } },
      lease: true,
    },
  });
}
