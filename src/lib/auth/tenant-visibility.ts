import type { Prisma } from '@prisma/client';

/**
 * Who is asking. Mirrors the JWT session payload used by the API routes.
 */
export interface TenantScopeSession {
  userId: string;
  role?: string | null;
}

/**
 * The minimum shape of a tenant record needed to decide visibility — works
 * with any Prisma include that carries `unit -> property.ownerId`.
 */
export interface TenantVisibilityRecord {
  unitId?: string | null;
  addedById?: string | null;
  unit?: { property?: { ownerId?: string | null } | null } | null;
}

export type ExistingTenantRelation = 'OWN' | 'CLAIMABLE' | 'FOREIGN';

function isManagement(role?: string | null): boolean {
  return role === 'LANDLORD' || role === 'MANAGER';
}

/**
 * Prisma `where` that limits a tenant list to the records one user is allowed
 * to see — the same rule every management endpoint must apply.
 *
 * A tenant is visible to a landlord only when:
 *   1. their unit sits on a property the landlord owns, or
 *   2. the landlord added them and they have no unit yet (pending onboarding).
 *
 * A Tenant record that a person created for themselves by registering has no
 * unit and no `addedById`, so it matches neither branch: self-registered
 * accounts never show up in a landlord's list until that landlord adds them.
 *
 * Super admins see everything; every other role sees nothing.
 */
export function getTenantScopeWhere(session: TenantScopeSession): Prisma.TenantWhereInput {
  if (session.role === 'SUPER_ADMIN') return {};
  if (isManagement(session.role)) {
    return {
      OR: [
        { unit: { property: { ownerId: session.userId } } },
        { AND: [{ unitId: null }, { addedById: session.userId }] },
      ],
    };
  }
  // Tenants, caretakers and other roles never list other people's records
  // through a management endpoint: a filter that matches nothing.
  return { id: { in: [] } };
}

/**
 * True when this session may view or edit this specific tenant record
 * (used for single-record routes such as PATCH /api/tenants/[id]).
 */
export function canManageTenantRecord(
  tenant: TenantVisibilityRecord,
  session: TenantScopeSession
): boolean {
  if (session.role === 'SUPER_ADMIN') return true;
  if (!isManagement(session.role)) return false;
  // Occupying one of the landlord's units links the record to them.
  if (tenant.unit?.property?.ownerId && tenant.unit.property.ownerId === session.userId) {
    return true;
  }
  // A pending record the landlord added themselves.
  if (!tenant.unitId && tenant.addedById === session.userId) return true;
  return false;
}

/**
 * True when this session may also take over an unassigned record that nobody
 * has added yet — the profile auto-created when the person registered.
 * Claiming it (setting `addedById`) is how a landlord "adds" a tenant who
 * already has an account, without creating a duplicate record.
 */
export function canClaimTenantRecord(
  tenant: TenantVisibilityRecord,
  session: TenantScopeSession
): boolean {
  if (canManageTenantRecord(tenant, session)) return true;
  if (!isManagement(session.role)) return false;
  return !tenant.unitId && !tenant.addedById;
}

/**
 * Classifies an existing record found by email/phone during onboarding so the
 * caller can react correctly:
 *   OWN        — it's already this user's tenant (tell them to assign a unit)
 *   CLAIMABLE  — an unowned, unassigned profile; adopt it instead of duplicating
 *   FOREIGN    — it belongs to another landlord; refuse the add
 */
export function classifyExistingTenant(
  tenant: TenantVisibilityRecord,
  session: TenantScopeSession
): ExistingTenantRelation {
  if (canManageTenantRecord(tenant, session)) return 'OWN';
  if (canClaimTenantRecord(tenant, session)) return 'CLAIMABLE';
  return 'FOREIGN';
}

/**
 * What an "add tenant" flow should do when the entered contact matches an
 * existing Tenant record.
 *
 * EMAIL identifies the person's login account, so it is a hard duplicate
 * guard: unassigned records are adopted, real duplicates are blocked with
 * actionable guidance.
 *
 * PHONE is NOT an identity — Kenyan households routinely share one number, so
 * a phone match can never block a landlord from adding their own tenant. An
 * unassigned record is still reused (re-inviting the same person), but an
 * occupied record simply results in a fresh record for this landlord. The old
 * behaviour — blocking with `"already has a room. Use Change Unit"` even when
 * the record belongs to a different landlord — left no way forward at all.
 */
export type TenantContactDecision =
  | { action: 'ADOPT' }
  | { action: 'CREATE' }
  | { action: 'BLOCK'; message: string };

export interface OnboardingContactRecord extends TenantVisibilityRecord {
  firstName?: string | null;
  lastName?: string | null;
}

export function resolveTenantContact(
  existing: OnboardingContactRecord | null,
  matchType: 'EMAIL' | 'PHONE',
  session: TenantScopeSession
): TenantContactDecision {
  if (!existing) return { action: 'CREATE' };

  // An unassigned record this landlord may claim (or that nobody has added)
  // is the same person being onboarded — reuse it instead of duplicating it.
  if (!existing.unitId && canClaimTenantRecord(existing, session)) {
    return { action: 'ADOPT' };
  }

  if (matchType === 'PHONE') {
    // Shared household phone: never block — give this landlord their own record.
    return { action: 'CREATE' };
  }

  const name =
    `${existing.firstName ?? ''} ${existing.lastName ?? ''}`.trim() || 'This person';

  if (canManageTenantRecord(existing, session)) {
    return {
      action: 'BLOCK',
      message: `${name} already has a room. Use "Change Unit" to move them.`,
    };
  }
  return { action: 'BLOCK', message: `${name} has already been added by another landlord.` };
}
