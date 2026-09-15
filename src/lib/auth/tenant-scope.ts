import prisma from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { normalizeEmail, normalizePhone } from '@/lib/utils/contact';

export { normalizeEmail, normalizePhone };

const TENANT_PROFILE_INCLUDE = {
  unit: { include: { property: true } },
  lease: true,
};

/**
 * Contact filters are case-insensitive on email so a landlord can enter
 * "Mary@Example.com" and the tenant still links when signing in with
 * "mary@example.com".
 */
function userContactFilter(email?: string | null, phone?: string | null): Prisma.UserWhereInput[] {
  const or: Prisma.UserWhereInput[] = [];
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  if (normalizedEmail) or.push({ email: { equals: normalizedEmail, mode: 'insensitive' } });
  if (normalizedPhone) or.push({ phone: normalizedPhone });
  return or;
}

function tenantContactFilter(email?: string | null, phone?: string | null): Prisma.TenantWhereInput[] {
  const or: Prisma.TenantWhereInput[] = [];
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  if (normalizedEmail) or.push({ email: { equals: normalizedEmail, mode: 'insensitive' } });
  if (normalizedPhone) or.push({ phone: normalizedPhone });
  return or;
}

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
 * Finds the TENANT-role login account that owns this email or phone, if any.
 * Used to link a landlord-onboarded tenant record to the person's account so
 * they actually see the room they were allocated.
 */
export async function findMatchingTenantUser(email?: string | null, phone?: string | null) {
  const or = userContactFilter(email, phone);
  if (or.length === 0) return null;

  return prisma.user.findFirst({
    where: { role: 'TENANT', OR: or },
    select: { id: true, email: true, phone: true, firstName: true, lastName: true },
  });
}

/**
 * Returns the Tenant record linked to a user account — creating one from the
 * user's profile if none exists yet. This "self-heals" accounts registered via
 * the public sign-up form, which previously had no linked Tenant record and
 * were blocked from paying / using the tenant sections.
 *
 * Before creating a profile, it claims an existing UNLINKED tenant record that
 * matches the user's email or phone. A landlord can add a tenant and allocate a
 * room before that person ever signs up; when they register (or sign in with
 * Google) using that email, this links them to that exact record so the
 * allocated room shows up immediately instead of a duplicate empty profile
 * being created.
 *
 * NOTE: findFirst-then-create has a small race window (two concurrent requests
 * could both create a record). There is deliberately NO unique index on
 * Tenant.userId: it is nullable, and a MongoDB unique index would reject
 * multiple documents with null userId (the same null-collision bug that was
 * fixed on Payment.transactionCode). The window is tiny and self-correcting in
 * practice — do not "fix" it by adding @unique.
 */
export async function ensureTenantRecord(userId: string) {
  const existing = await getTenantRecord(userId);
  if (existing) return existing;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  // Only TENANT-role users get an auto-created profile — caretakers and other
  // non-management roles must never silently receive a Tenant record.
  if (!user || user.role !== 'TENANT') return null;

  // Claim a pre-created, unlinked record that belongs to this person. The
  // record may have been invited with only an email/phone (placeholder name),
  // so adopt the name the person actually registered with.
  const claimable = await findUnlinkedTenantFor(user.email, user.phone);
  if (claimable) {
    return prisma.tenant.update({
      where: { id: claimable.id },
      data: {
        userId: user.id,
        firstName: user.firstName?.trim() || claimable.firstName,
        lastName: user.lastName?.trim() || claimable.lastName,
      },
      include: TENANT_PROFILE_INCLUDE,
    });
  }

  return prisma.tenant.create({
    data: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: normalizeEmail(user.email),
      phone: user.phone || '',
      isActive: true,
      userId: user.id,
    },
    include: TENANT_PROFILE_INCLUDE,
  });
}

/** Finds an unlinked Tenant record matching an email/phone (case-insensitive). */
async function findUnlinkedTenantFor(email?: string | null, phone?: string | null) {
  const or = tenantContactFilter(email, phone);
  if (or.length === 0) return null;

  return prisma.tenant.findFirst({ where: { userId: null, OR: or } });
}
