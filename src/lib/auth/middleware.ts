import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './jwt';
import type { UserRole } from '@/types';

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/api/auth/login', '/api/auth/register'];

const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 100,
  LANDLORD: 80,
  TENANT: 20,
};

export function requireRole(minimumRole: UserRole) {
  return async (request: NextRequest) => {
    const token = request.cookies.get('boma-yangu-session')?.value;
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const payload = await verifyToken(token);
    
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    const userLevel = ROLE_HIERARCHY[payload.role as UserRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole];

    if (userLevel < requiredLevel) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    return NextResponse.next();
  };
}

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

export function getRolesAbove(role: UserRole): UserRole[] {
  const level = ROLE_HIERARCHY[role];
  return (Object.entries(ROLE_HIERARCHY) as [UserRole, number][])
    .filter(([, lvl]) => lvl >= level)
    .map(([r]) => r);
}

export function getRolesBelow(role: UserRole): UserRole[] {
  const level = ROLE_HIERARCHY[role];
  return (Object.entries(ROLE_HIERARCHY) as [UserRole, number][])
    .filter(([, lvl]) => lvl < level)
    .map(([r]) => r);
}
