import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  return NextResponse.redirect(new URL('/login?error=invalid_auth_callback', origin));
}

