import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken, isPublicRoute } from '@/lib/auth';

const PUBLIC_ROUTES = ['/', '/login', '/register', '/forgot-password'];
const API_PUBLIC_ROUTES = ['/api/auth/login', '/api/auth/register'];

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images).*)',
  ],
};
