import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { getTenantRecord } from '@/lib/auth/tenant-scope';
import { isManagementRole } from '@/lib/auth/rbac';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (isManagementRole(session.role)) {
      const tenants = await prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          unit: { include: { property: { select: { name: true } } } },
          user: { select: { id: true, email: true } },
        },
      });
      return NextResponse.json({ success: true, data: tenants });
    }

    // TENANT: only their own profile
    const tenantRecord = await getTenantRecord(session.userId);
    if (!tenantRecord) {
      return NextResponse.json({ success: true, data: [] });
    }
    const tenants = await prisma.tenant.findMany({
      where: { id: tenantRecord.id },
      include: {
        unit: { include: { property: { select: { name: true } } } },
        user: { select: { id: true, email: true } },
      },
    });
    return NextResponse.json({ success: true, data: tenants });
  } catch (error) {
    console.error('List tenants error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch tenants' }, { status: 500 });
  }
}
