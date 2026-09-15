import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { createToken, setSessionCookie } from '@/lib/auth/jwt';
import { verifyPassword } from '@/lib/auth/password';
import { loginSchema } from '@/lib/utils/validation';
import { logActivity, extractIpAddress } from '@/lib/db/activity-logger';
import type { UserRole } from '@/types';
import type { Prisma } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = loginSchema.parse(body);

    // Look up by email or phone so a landlord-onboarded tenant who signed up
    // with only a phone (no email) can still log in.
    const orConditions: Prisma.UserWhereInput[] = [];
    if (validated.email) {
      orConditions.push({ email: { equals: validated.email, mode: 'insensitive' } });
    }
    if (validated.phone) {
      orConditions.push({ phone: validated.phone });
    }

    if (orConditions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Enter your email or phone number' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: { OR: orConditions },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email, phone or password' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(validated.password, user.passwordHash);

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const token = await createToken({
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
    });

    setSessionCookie(token);

    // Self-heal: if a landlord added this person as a tenant (with a
    // pre-created Tenant record) before they ever signed in, link the record
    // now so My Room and payments work immediately instead of waiting for the
    // first page load to trigger ensureTenantRecord.
    if (user.role === 'TENANT') {
      try {
        const { ensureTenantRecord } = await import('@/lib/auth/tenant-scope');
        await ensureTenantRecord(user.id);
      } catch (linkError) {
        console.error('Failed to link tenant profile on login:', linkError);
      }
    }    // Reflect the login in PostgreSQL: update lastLoginAt and log a LoginRecord.
    // Best-effort: never let telemetry failure turn a successful login into an error.
    try {
      const ipAddress = extractIpAddress(request);
      const userAgent = request.headers.get('user-agent') || null;

      await Promise.all([
        prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }),
        prisma.loginRecord.create({
          data: {
            userId: user.id,
            email: user.email,
            ipAddress,
            userAgent,
          },
        }),
        logActivity({
          action: 'USER_LOGIN',
          description: `${user.firstName} ${user.lastName} logged in`,
          entityType: 'USER',
          entityId: user.id,
          userId: user.id,
          ipAddress,
        }),
      ]);
    } catch (recordError) {
      console.error('Failed to record login:', recordError);
    }

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
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Login failed' },
      { status: 500 }
    );
  }
}
