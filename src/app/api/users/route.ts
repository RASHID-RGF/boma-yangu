import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/password';
import { logActivity, logAudit, extractIpAddress, extractUserAgent } from '@/lib/db/activity-logger';
import { z } from 'zod';

const createUserSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['SUPER_ADMIN', 'LANDLORD', 'TENANT']),
});

const USER_SELECT = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  role: true,
  isVerified: true,
  isTwoFactorEnabled: true,
  avatarUrl: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'SUPER_ADMIN' && session.role !== 'LANDLORD') {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.toLowerCase() || '';
    const role = searchParams.get('role') || '';

    const users = await prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    const filtered = users.filter((u) => {
      const matchesQuery =
        !q ||
        u.email.toLowerCase().includes(q) ||
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q);
      const matchesRole = !role || u.role === role;
      return matchesQuery && matchesRole;
    });

    return NextResponse.json({ success: true, data: filtered, total: filtered.length });
  } catch (error) {
    console.error('List users error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'SUPER_ADMIN' && session.role !== 'LANDLORD') {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const validated = createUserSchema.parse(body);

    // Only a SUPER_ADMIN can create another SUPER_ADMIN (prevents LANDLORD escalation)
    if (session.role !== 'SUPER_ADMIN' && validated.role === 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Only a super admin can create super admin accounts' },
        { status: 403 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email: validated.email } });
    if (existing) {
      return NextResponse.json({ success: false, error: 'Email already registered' }, { status: 400 });
    }

    const passwordHash = await hashPassword(validated.password);
    const user = await prisma.user.create({
      data: {
        firstName: validated.firstName,
        lastName: validated.lastName,
        email: validated.email,
        phone: validated.phone || null,
        passwordHash,
        role: validated.role,
        isVerified: false,
      },
      select: USER_SELECT,
    });

    // Log user creation activity and audit trail
    const ipAddress = extractIpAddress(request);
    logActivity({
      action: 'USER_CREATED',
      description: `User ${user.firstName} ${user.lastName} (${user.email}) created with role ${user.role}`,
      entityType: 'USER',
      entityId: user.id,
      userId: session.userId,
      ipAddress,
    });
    logAudit({
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: user.id,
      userId: session.userId,
      newValue: { email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
      ipAddress,
      userAgent: extractUserAgent(request),
    });

    return NextResponse.json({ success: true, data: user }, { status: 201 });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Create user error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create user' }, { status: 500 });
  }
}
