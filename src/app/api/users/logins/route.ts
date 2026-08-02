import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';

const LOGIN_RECORD_SELECT = {
  id: true,
  email: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  },
} as const;

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'SUPER_ADMIN' && session.role !== 'LANDLORD') {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const records = await prisma.loginRecord.findMany({
      select: LOGIN_RECORD_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const total = await prisma.loginRecord.count();

    return NextResponse.json({ success: true, data: records, total });
  } catch (error) {
    console.error('Login history error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch login history' }, { status: 500 });
  }
}
