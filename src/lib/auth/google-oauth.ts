import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/db/prisma';
import { createToken } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/password';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';
import { normalizeGoogleProfile } from '@/lib/auth/google';
import type { UserRole } from '@/types';

export async function handleGoogleOAuthCallback(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    console.error('Google OAuth callback returned error:', error);
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_AUTHORIZED_REDIRECT_URI || `${origin}${request.nextUrl.pathname}`;

  if (!clientId || !clientSecret) {
    console.error('Google OAuth client ID or secret is missing in environment');
    return NextResponse.redirect(new URL('/login?error=google_not_configured', origin));
  }

  try {
    // 1. Exchange authorization code with Google for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error('Failed to exchange Google OAuth code:', errorBody);
      return NextResponse.redirect(new URL('/login?error=token_exchange_failed', origin));
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const idToken = tokenData.id_token;

    // 2. Fetch user profile from Google using access token or id token
    let profileData: any = {};
    if (accessToken) {
      try {
        const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userinfoRes.ok) {
          profileData = await userinfoRes.json();
        }
      } catch (fetchErr) {
        console.error('Failed to fetch Google userinfo with access token:', fetchErr);
      }
    }

    if (!profileData.email && idToken) {
      try {
        const tokeninfoRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
        );
        if (tokeninfoRes.ok) {
          profileData = await tokeninfoRes.json();
        }
      } catch (tokeninfoErr) {
        console.error('Failed to fetch Google tokeninfo with id token:', tokeninfoErr);
      }
    }

    const profile = normalizeGoogleProfile(profileData);
    const email = profile.email.toLowerCase();

    if (!email) {
      throw new Error('No email found in Google account profile');
    }

    // 3. Find or create user in database
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      const passwordHash = await hashPassword(`google-${crypto.randomUUID()}-${Date.now()}`);
      user = await prisma.user.create({
        data: {
          email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          passwordHash,
          avatarUrl: profile.avatarUrl,
          role: 'TENANT',
          isVerified: profile.isVerified,
        },
      });

      try {
        await ensureTenantRecord(user.id);
      } catch (tenantErr) {
        console.error('Failed to create tenant profile for Google user:', tenantErr);
      }
    } else {
      const needsProfileUpdate =
        user.firstName !== profile.firstName ||
        user.lastName !== profile.lastName ||
        (user.avatarUrl || null) !== (profile.avatarUrl || null) ||
        (user.isVerified !== profile.isVerified && profile.isVerified);

      if (needsProfileUpdate) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            firstName: profile.firstName,
            lastName: profile.lastName,
            avatarUrl: profile.avatarUrl || user.avatarUrl,
            isVerified: user.isVerified || profile.isVerified,
          },
        });
      }
    }

    // 4. Create session JWT token
    const token = await createToken({
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
    });

    // 5. Build redirect response with secure session cookie
    const response = NextResponse.redirect(new URL('/dashboard', origin));
    response.cookies.set('boma-yangu-session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('Google OAuth callback error:', err);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(err.message || 'Google sign-in failed')}`, origin)
    );
  }
}

