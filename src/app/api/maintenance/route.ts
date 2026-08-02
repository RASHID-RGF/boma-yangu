import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { getTenantRecord } from '@/lib/auth/tenant-scope';
import { isManagementRole } from '@/lib/auth/rbac';
import { z } from 'zod';

const createMaintenanceSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(5, 'Describe the issue in a few words'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantRecord = !isManagementRole(session.role) ? await getTenantRecord(session.userId) : null;

    // A tenant account without a linked Tenant record must never see estate-wide data.
    if (!isManagementRole(session.role) && !tenantRecord) {
      return NextResponse.json({
        success: true,
        data: [],
        stats: { openCount: 0, count: 0, urgentCount: 0 },
      });
    }

    const requests = await prisma.maintenanceRequest.findMany({
      where: tenantRecord ? { tenantId: tenantRecord.id } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: { select: { firstName: true, lastName: true } },
        unit: { select: { unitNumber: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });

    const openCount = requests.filter((r) => ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'].includes(r.status)).length;
    const urgentCount = requests.filter((r) => r.priority === 'URGENT' && r.status !== 'COMPLETED').length;

    return NextResponse.json({
      success: true,
      data: requests,
      stats: { openCount, count: requests.length, urgentCount },
    });
  } catch (error) {
    console.error('List maintenance error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch maintenance requests' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createMaintenanceSchema.parse(body);

    const tenantRecord = !isManagementRole(session.role) ? await getTenantRecord(session.userId) : null;
    if (!tenantRecord) {
      return NextResponse.json(
        { success: false, error: 'No tenant profile linked to this account. Contact management.' },
        { status: 400 }
      );
    }
    if (!tenantRecord.unitId) {
      return NextResponse.json(
        { success: false, error: 'No unit linked to your tenant profile. Contact management.' },
        { status: 400 }
      );
    }

    const request_ = await prisma.maintenanceRequest.create({
      data: {
        title: validated.title,
        description: validated.description,
        priority: validated.priority,
        status: 'REPORTED',
        tenantId: tenantRecord.id,
        unitId: tenantRecord.unitId,
        reportedById: session.userId,
      },
      include: {
        tenant: { select: { firstName: true, lastName: true } },
        unit: { select: { unitNumber: true } },
      },
    });

    // Notify management so the request isn't silently dropped
    try {
      const management = await prisma.user.findMany({
        where: { role: { in: ['LANDLORD', 'MANAGER', 'SUPER_ADMIN'] } },
        select: { id: true },
      });
      await prisma.notification.createMany({
        data: management.map((u) => ({
          userId: u.id,
          type: 'MAINTENANCE_UPDATE',
          title: 'New maintenance request',
          message: `${validated.title} — ${validated.description}`,
        })),
      });
    } catch (e) {
      console.error('Maintenance notification error:', e);
    }

    return NextResponse.json({ success: true, data: request_ }, { status: 201 });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Create maintenance error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create maintenance request' }, { status: 500 });
  }
}
