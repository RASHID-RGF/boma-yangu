import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { hashPassword, createToken, setSessionCookie } from '@/lib/auth/jwt';
import { registerSchema } from '@/lib/utils/validation';

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
        phone: validated.phone,
        firstName: validated.firstName,
        lastName: validated.lastName,
        passwordHash,
        role: validated.role as any,
      },
    });

    // Create session
    const token = await createToken({
      id: user.id,
      email: user.email,
      role: user.role,
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
