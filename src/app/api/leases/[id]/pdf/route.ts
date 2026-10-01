import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { isManagementRole } from '@/lib/auth/rbac';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';
import { buildLeasePdf } from '@/lib/pdf/lease-pdf';
import { logActivity, extractIpAddress } from '@/lib/db/activity-logger';

/**
 * GET /api/leases/[id]/pdf
 *
 * Streams the lease agreement as a generated PDF. Tenants can only download
 * their own lease; management only leases on their own properties — the same
 * scoping as /api/leases.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantRecord = !isManagementRole(session.role)
      ? await ensureTenantRecord(session.userId)
      : null;

    const include = {
      tenant: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          idNumber: true,
          unitId: true,
        },
      },
      unit: {
        select: {
          id: true,
          unitNumber: true,
          monthlyRent: true,
          bedrooms: true,
          bathrooms: true,
          property: { select: { id: true, name: true, address: true, city: true, ownerId: true } },
        },
      },
      createdBy: { select: { firstName: true, lastName: true, role: true } },
    };

    const lease = await prisma.lease.findUnique({ where: { id: params.id }, include });
    if (!lease) {
      return NextResponse.json({ success: false, error: 'Lease not found' }, { status: 404 });
    }

    // Access check mirrors the list endpoint: a tenant sees only their own
    // lease, management only leases on units of their own properties.
    const ownerId = lease.unit?.property?.ownerId;
    const allowed =
      session.role === 'SUPER_ADMIN' ||
      (isManagementRole(session.role) && ownerId === session.userId) ||
      lease.createdById === session.userId ||
      (tenantRecord && lease.tenantId === tenantRecord.id);

    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Lease not found' }, { status: 404 });
    }

    const { unit, ...rest } = lease as typeof lease & {
      unit: NonNullable<typeof lease.unit> & { property: { ownerId: string } };
    };
    const pdf = buildLeasePdf({ ...rest, unit });

    logActivity({
      action: 'LEASE_PDF_GENERATED',
      description: `Lease PDF generated for ${lease.tenant.firstName} ${lease.tenant.lastName}`,
      entityType: 'LEASE',
      entityId: lease.id,
      userId: session.userId,
      propertyId: lease.unit?.property?.id ?? null,
      ipAddress: extractIpAddress(request),
    });

    const filename = `lease-${lease.tenant.firstName}-${lease.tenant.lastName}-${lease.id.slice(0, 8)}.pdf`
      .replace(/[^a-zA-Z0-9.-]/g, '-')
      .toLowerCase();

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Lease PDF error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate lease PDF' }, { status: 500 });
  }
}
