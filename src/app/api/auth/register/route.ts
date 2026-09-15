import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { createToken, setSessionCookie } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/password';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';
import { registerSchema } from '@/lib/utils/validation';
import { logActivity, extractIpAddress } from '@/lib/db/activity-logger';
import type { UserRole } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = registerSchema.parse(body);

    // Check existing user
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'Email already registered' },
        { status: 400 }
      );
    }

    // Create user
    const passwordHash = await hashPassword(validated.password);
    const user = await prisma.user.create({
      data: {
        email: validated.email,
        firstName: validated.firstName,
        lastName: validated.lastName,
        passwordHash,
        role: validated.role as string,
      },
    });

    // Auto-link a Tenant profile for self-registered tenants so the tenant
    // sections (payments, invoices, maintenance, documents) work immediately.
    // ensureTenantRecord only creates when none exists — a profile that
    // management pre-created (and linked to this user) is never duplicated.
    // Best-effort: never let a profile-creation failure block registration.
    if (user.role === 'TENANT') {
      try {
        await ensureTenantRecord(user.id);
      } catch (tenantError) {
        console.error('Failed to create linked tenant profile:', tenantError);
      }
    }

    // Create session
    const token = await createToken({
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
    });

    setSessionCookie(token);    // Reflect the registration in PostgreSQL. Best-effort: never let a
    // telemetry failure turn a successful registration into an error.
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
          action: 'USER_REGISTERED',
          description: `${user.firstName} ${user.lastName} registered as ${user.role}`,
          entityType: 'USER',
          entityId: user.id,
          userId: user.id,
          ipAddress,
        }),
      ]);
    } catch (recordError) {
      console.error('Failed to record registration:', recordError);
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
      { success: false, error: 'Registration failed' },
      { status: 500 }
    );
  }
}
