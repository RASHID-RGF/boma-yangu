import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { canAccessRoute, getRoleHome } from '@/lib/auth/rbac';
import type { UserRole } from '@/types';

const PUBLIC_ROUTES = ['/', '/login', '/register', '/forgot-password'];
const API_PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/payments/palpluss-callback',
  '/api/payments/daraja-callback',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.includes(pathname) || API_PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  // Allow public assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/images') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  // Check authentication
  const token = request.cookies.get('boma-yangu-session')?.value;

  if (!token) {
    // Redirect to login for page routes
    if (!pathname.startsWith('/api')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const payload = await verifyToken(token);
  if (!payload) {
    if (!pathname.startsWith('/api')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.json(
      { success: false, error: 'Invalid token' },
      { status: 401 }
    );
  }

  // Role-based access control for page routes (APIs enforce their own guards)
  if (!pathname.startsWith('/api')) {
    const role = payload.role as UserRole;
    if (!canAccessRoute(role, pathname)) {
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
