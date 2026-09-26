import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { getTenantScopeWhere } from '@/lib/auth/tenant-visibility';
import type { Prisma } from '@prisma/client';

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

    // Super admin: every login record. A landlord: only their own records and
    // those of the tenants they own/added (IPs and user agents are sensitive).
    let recordWhere: Prisma.LoginRecordWhereInput = {};
    if (session.role !== 'SUPER_ADMIN') {
      const tenantRows = await prisma.tenant.findMany({
        where: getTenantScopeWhere(session),
        select: { userId: true },
      });
      const linkedIds = tenantRows
        .map((t) => t.userId)
        .filter((id): id is string => !!id);
      recordWhere = { userId: { in: [session.userId, ...linkedIds] } };
    }

    const records = await prisma.loginRecord.findMany({
      where: recordWhere,
      select: LOGIN_RECORD_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const total = await prisma.loginRecord.count({ where: recordWhere });

    return NextResponse.json({ success: true, data: records, total });
  } catch (error) {
    console.error('Login history error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch login history' }, { status: 500 });
  }
}
