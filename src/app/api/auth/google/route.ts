import { NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/db/prisma';
import { createToken, setSessionCookie } from '@/lib/auth/jwt';
import { verifyGoogleToken } from '@/lib/auth/google';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';
import type { UserRole } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const credential = typeof body?.credential === 'string' ? body.credential : '';

    if (!credential) {
      return NextResponse.json(
        { success: false, error: 'Google credential is required' },
        { status: 400 }
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { success: false, error: 'Google authentication is not configured yet' },
        { status: 500 }
      );
    }

    const profile = await verifyGoogleToken(credential, clientId);
    const email = profile.email.toLowerCase();

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
      } catch (tenantError) {
        console.error('Failed to create tenant profile for Google login:', tenantError);
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

    const token = await createToken({
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
    });

    setSessionCookie(token);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
        },
        token,
      },
    });
  } catch (error: any) {
    console.error('Google sign-in failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Google sign-in failed',
      },
      { status: 401 }
    );
  }
}

async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 12);
}
