import { NextResponse, type NextRequest } from 'next/server';
import { handleGoogleOAuthCallback } from '@/lib/auth/google-oauth';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    return handleGoogleOAuthCallback(request);
  }
  const { origin } = request.nextUrl;
  return NextResponse.redirect(new URL('/login?error=invalid_auth_callback', origin));
}

