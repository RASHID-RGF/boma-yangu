import { UserRole } from '@/types';

// ============ ROLE GROUPS ============
// Convenience groups so the sidebar and route guards stay in sync.

/** Full management access (property owners & professional managers). */
export const MANAGEMENT_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.LANDLORD,
  UserRole.MANAGER,
];

/** Management + caretaker (day-to-day site operations). */
export const OPERATIONS_ROLES: UserRole[] = [
  ...MANAGEMENT_ROLES,
  UserRole.CARETAKER,
];

/** Anyone who can see the tenant-facing money sections (pay/invoices). */
export const FINANCIAL_ROLES: UserRole[] = [
  ...MANAGEMENT_ROLES,
  UserRole.TENANT,
];

/**
 * Monitor-only money access: caretakers can watch payments and invoices for
 * the properties they are assigned to, but can never record or edit money.
 */
export const MONITORING_ROLES: UserRole[] = [
  ...MANAGEMENT_ROLES,
  UserRole.CARETAKER,
];

export const ALL_ROLES: UserRole[] = Object.values(UserRole);

// ============ ROUTE ACCESS RULES ============
// Ordered from most specific to least specific prefix.
export interface RouteRule {
  prefix: string;
  roles: UserRole[];
}

export const ROUTE_ACCESS: RouteRule[] = [
  { prefix: '/admin', roles: [UserRole.SUPER_ADMIN] },
  { prefix: '/portal/tenant', roles: [UserRole.TENANT] },
  { prefix: '/portal/caretaker', roles: [UserRole.CARETAKER] },
  { prefix: '/properties', roles: MANAGEMENT_ROLES },
  { prefix: '/units', roles: OPERATIONS_ROLES },
  { prefix: '/tenants', roles: MANAGEMENT_ROLES },
  { prefix: '/payments', roles: [...FINANCIAL_ROLES, UserRole.CARETAKER] },
  { prefix: '/invoices', roles: [...FINANCIAL_ROLES, UserRole.CARETAKER] },
  { prefix: '/maintenance', roles: ALL_ROLES },
  { prefix: '/leases', roles: MANAGEMENT_ROLES },
  { prefix: '/reports', roles: MANAGEMENT_ROLES },
  { prefix: '/documents', roles: FINANCIAL_ROLES },
  { prefix: '/messages', roles: ALL_ROLES },
  { prefix: '/notifications', roles: ALL_ROLES },
  { prefix: '/dashboard', roles: ALL_ROLES },
];

/** Where each role should land after login / when denied a section. */
export const ROLE_HOME: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: '/dashboard',
  [UserRole.LANDLORD]: '/dashboard',
  [UserRole.MANAGER]: '/dashboard',
  // Portal pages are not built yet — everyone lands on the dashboard for now.
  [UserRole.CARETAKER]: '/dashboard',
  [UserRole.TENANT]: '/dashboard',
};

/**
 * Returns true if the given role may access the pathname.
 * Falls back to the home page for that role when a section is off-limits.
 */
export function canAccessRoute(role: UserRole, pathname: string): boolean {
  for (const rule of ROUTE_ACCESS) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.roles.includes(role);
    }
  }
  return true;
}

/** Home page for a role (used for redirects after login or access denial). */

export function getRoleHome(role: UserRole): string {
  return ROLE_HOME[role] ?? '/dashboard';
}

/** True for roles that manage the whole estate (see everything). */
export function isManagementRole(role: string | undefined | null): boolean {
  return !!role && (MANAGEMENT_ROLES as string[]).includes(role);
}
