import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/password';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const updateUserSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  role: z.enum(['SUPER_ADMIN', 'LANDLORD', 'MANAGER', 'CARETAKER', 'TENANT']).optional(),
  isVerified: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const validated = updateUserSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Prevent removing your own SUPER_ADMIN role
    if (params.id === session.userId && validated.role && validated.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'You cannot demote your own admin account' },
        { status: 400 }
      );
    }

    const data: Prisma.UserUpdateInput = {};
    if (validated.firstName) data.firstName = validated.firstName;
    if (validated.lastName) data.lastName = validated.lastName;
    if (validated.email) data.email = validated.email;
    if (validated.phone !== undefined) data.phone = validated.phone;
    if (validated.role) data.role = validated.role;
    if (validated.isVerified !== undefined) data.isVerified = validated.isVerified;
    if (validated.password) data.passwordHash = await hashPassword(validated.password);

    // Check email uniqueness if email is being changed
    if (validated.email && validated.email !== existing.email) {
      const dup = await prisma.user.findUnique({ where: { email: validated.email } });
      if (dup) {
        return NextResponse.json({ success: false, error: 'Email already in use' }, { status: 400 });
      }
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        isVerified: true,
        avatarUrl: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: user });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Update user error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    if (params.id === session.userId) {
      return NextResponse.json(
        { success: false, error: 'You cannot delete your own account' },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    await prisma.user.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true, message: 'User deleted' });
  } catch (error: any) {
    // User is referenced by other records (properties, tenants, payments, etc.)
    if (error?.code === 'P2014' || error?.code === 'P2003') {
      return NextResponse.json(
        { success: false, error: 'This user has related records and cannot be deleted' },
        { status: 400 }
      );
    }
    console.error('Delete user error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete user' }, { status: 500 });
  }
}
