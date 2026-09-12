import { NextResponse, type NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import { canAccessRoute, getRoleHome } from '@/lib/auth/rbac';
import type { UserRole } from '@/types';

const PUBLIC_ROUTES = ['/', '/login', '/register', '/forgot-password'];
const API_PUBLIC_ROUTES = [
  '/api/auth/callback',
  '/api/payments/palpluss-callback',
  '/api/payments/daraja-callback',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.includes(pathname) || API_PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('boma-yangu-session')?.value;

  if (!token) {
    if (!pathname.startsWith('/api')) {
      const url = new URL('/login', request.url);
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }

    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const payload = await verifyToken(token);

  if (!payload) {
    if (!pathname.startsWith('/api')) {
      const url = new URL('/login', request.url);
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }

    return NextResponse.json(
      { success: false, error: 'Invalid session' },
      { status: 401 }
    );
  }

  if (!pathname.startsWith('/api')) {
    const role = payload.role as UserRole | undefined;
    if (role && !canAccessRoute(role, pathname)) {
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
