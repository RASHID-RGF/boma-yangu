/**
 * Prisma `where` helpers scoping unit queries by role, shared by API routes
 * that list units. Landlords/managers see only units on properties they own;
 * super admins see everything.
 */
export function getUnitScopeWhere(
  role: string | undefined | null,
  userId: string
): Record<string, unknown> {
  if (role === 'SUPER_ADMIN') return {};
  if (role === 'LANDLORD' || role === 'MANAGER') {
    return { property: { is: { ownerId: userId } } };
  }
  return {};
}
