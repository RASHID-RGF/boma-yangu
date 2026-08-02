import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { createToken, verifyPassword, setSessionCookie } from '@/lib/auth/jwt';
import { loginSchema } from '@/lib/utils/validation';
import type { UserRole } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = loginSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
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

    // Reflect the login in MongoDB: update lastLoginAt and log a LoginRecord.
    // Best-effort: never let telemetry failure turn a successful login into an error.
    try {
      const ipAddress =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        null;
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
        prisma.activityLog.create({
          data: {
            action: 'LOGIN',
            description: 'User logged in',
            entityType: 'USER',
            entityId: user.id,
            userId: user.id,
          },
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
