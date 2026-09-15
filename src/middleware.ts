import { NextResponse, type NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import { canAccessRoute, getRoleHome } from '@/lib/auth/rbac';
import type { UserRole } from '@/types';

const PUBLIC_ROUTES = [
  '/',
  '/home',
  '/login',
  '/register',
  '/forgot-password',
];

const API_PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/callback',
  '/api/auth/logout',
  '/api/payments/palpluss-callback',
  '/api/payments/daraja-callback',
];

const AUTH_ONLY_UNAUTHENTICATED = [
  '/login',
  '/register',
  '/forgot-password',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const normalizedPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  // 1. Static assets bypass
  if (
    normalizedPath.startsWith('/_next') ||
    normalizedPath.startsWith('/images') ||
    normalizedPath.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // 2. Public API routes bypass
  if (API_PUBLIC_ROUTES.some((route) => normalizedPath === route || normalizedPath.startsWith(`${route}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('boma-yangu-session')?.value;
  const payload = token ? await verifyToken(token) : null;

  // 3. Auth pages (/login, /register, /forgot-password)
  if (AUTH_ONLY_UNAUTHENTICATED.includes(normalizedPath)) {
    if (payload) {
      const role = payload.role as UserRole | undefined;
      return NextResponse.redirect(new URL(role ? getRoleHome(role) : '/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // 4. Public pages ('/', '/home')
  if (PUBLIC_ROUTES.includes(normalizedPath)) {
    return NextResponse.next();
  }

  // 5. Unauthenticated access to protected routes
  if (!payload) {
    if (!normalizedPath.startsWith('/api')) {
      const url = new URL('/login', request.url);
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }

    return NextResponse.json(
      { success: false, error: token ? 'Invalid session' : 'Unauthorized' },
      { status: 401 }
    );
  }

  // 6. Role-based route guard
  if (!normalizedPath.startsWith('/api')) {
    const role = payload.role as UserRole | undefined;
    if (role && !canAccessRoute(role, normalizedPath)) {
      return NextResponse.redirect(new URL(getRoleHome(role), request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images).*)',
  ],
};
