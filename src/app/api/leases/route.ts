import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';
import { isManagementRole } from '@/lib/auth/rbac';

/**
 * GET /api/leases
 *
 * Room-scoped lease listing — the same approach as My Room.
 * - TENANT sees ONLY their own lease (linked to their allocated room).
 * - Management sees all leases with tenant + unit context.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Self-registered tenant accounts get their Tenant profile auto-created so
    // they are never stuck with a "no linked tenant" dead end.
    const tenantRecord = !isManagementRole(session.role)
      ? await ensureTenantRecord(session.userId)
      : null;

    // A tenant account without a linked Tenant record must never see estate-wide data.
    if (!isManagementRole(session.role) && !tenantRecord) {
      return NextResponse.json({
        success: true,
        data: [],
        room: null,
      });
    }

    if (isManagementRole(session.role)) {
      // Management: see all leases with tenant + unit context.
      const leases = await prisma.lease.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          tenant: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
              unitId: true,
            },
          },
          unit: {
            select: {
              id: true,
              unitNumber: true,
              monthlyRent: true,
              property: { select: { id: true, name: true } },
            },
          },
          createdBy: {
            select: { firstName: true, lastName: true, role: true },
          },
        },
      });

      return NextResponse.json({ success: true, data: leases, room: null });
    }

    // Tenant: see ONLY their own lease — room-scoped, like My Room.
    const lease = await prisma.lease.findUnique({
      where: { tenantId: tenantRecord!.id },
      include: {
        tenant: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            unitId: true,
          },
        },
        unit: {
          select: {
            id: true,
            unitNumber: true,
            monthlyRent: true,
            depositAmount: true,
            bedrooms: true,
            bathrooms: true,
            property: {
              select: {
                id: true,
                name: true,
                address: true,
                city: true,
              },
            },
          },
        },
        createdBy: {
          select: { firstName: true, lastName: true, role: true },
        },
      },
    });

    // Return the room context so the page can display it like My Room.
    const room = tenantRecord!.unit
      ? {
          id: tenantRecord!.unit!.id,
          unitNumber: tenantRecord!.unit!.unitNumber,
          monthlyRent: tenantRecord!.unit!.monthlyRent,
          property: tenantRecord!.unit!.property
            ? {
                id: tenantRecord!.unit!.property!.id,
                name: tenantRecord!.unit!.property!.name,
              }
            : null,
        }
      : null;

    return NextResponse.json({
      success: true,
      data: lease ? [lease] : [],
      room,
    });
  } catch (error) {
    console.error('List leases error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch leases' }, { status: 500 });
  }
}
