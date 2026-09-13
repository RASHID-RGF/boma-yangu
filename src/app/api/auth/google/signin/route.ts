import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_AUTHORIZED_REDIRECT_URI || `${origin}/api/auth/callback/google`;

  if (!clientId) {
    console.error('Google client ID not configured');
    return NextResponse.redirect(new URL('/login?error=google_not_configured', origin));
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}

export async function POST(request: NextRequest) {
  return GET(request);
}

