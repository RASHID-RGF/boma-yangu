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

    // A tenant sees documents linked to their tenant record (lease, invoices, etc.).
    const tenantRecord = !isManagementRole(session.role) ? await getTenantRecord(session.userId) : null;

    // A tenant account without a linked Tenant record must never see estate-wide data.
    if (!isManagementRole(session.role) && !tenantRecord) {
      return NextResponse.json({
        success: true,
        data: [],
        stats: { count: 0, byType: {} },
      });
    }

    const documents = await prisma.document.findMany({
      where: tenantRecord
        ? { OR: [{ tenantId: tenantRecord.id }, { uploadedById: session.userId }] }
        : {},
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: { select: { firstName: true, lastName: true } },
        property: { select: { name: true } },
      },
    });

    const byType = documents.reduce<Record<string, number>>((acc, d) => {
      acc[d.type] = (acc[d.type] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: documents,
      stats: { count: documents.length, byType },
    });
  } catch (error) {
    console.error('List documents error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch documents' }, { status: 500 });
  }
}
