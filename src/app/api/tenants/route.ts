import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import {
  getTenantRecord,
  findMatchingTenantUser,
  normalizeEmail,
  normalizePhone,
} from '@/lib/auth/tenant-scope';
import { isManagementRole } from '@/lib/auth/rbac';
import { isVacantUnitStatus } from '@/lib/utils/room-assignment';
import { formatPaymentInstructions } from '@/lib/utils/payment-details';
import { logActivity, extractIpAddress } from '@/lib/db/activity-logger';
import { sendPortalNoticeEmail } from '@/lib/notifications/communication';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const createTenantSchema = z.object({
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  phone: z.string().min(7, 'A phone number is required'),
  email: z.string().email('Enter a valid email').optional().nullable(),
  idNumber: z.string().optional().nullable(),
  // Optionally allocate the room in the same step.
  unitId: z.string().optional().nullable(),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (isManagementRole(session.role)) {
      // Scope to the landlord's own properties (or all for super admin).
      const propertyWhere =
        session.role === 'SUPER_ADMIN'
          ? {}
          : {
            ownerId: session.userId,
            };

      // Include tenants on the landlord's properties AND tenants with no
      // unit yet (they were added but haven't been assigned a room).
      const tenantWhere =
        session.role === 'SUPER_ADMIN'
          ? {}
          : {
              OR: [
                { unit: { property: propertyWhere } },
                { unitId: null },
              ],
            };

      const tenants = await prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        where: tenantWhere,
        include: {
          // The tenant's unit, its property, and the property owner — that
          // owner is the tenant's landlord (they receive the rent payments).
          unit: {
            include: {
              property: {
                select: {
                  id: true,
                  name: true,
                  ownerId: true,
                  // The tenant's landlord (property owner) and the caretaker(s)
                  // assigned to that property — the two people each tenant is
                  // linked to through their unit.
                  owner: { select: { firstName: true, lastName: true, email: true, phone: true } },

                },
              },
            },
          },
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
        unit: {
          include: {
            property: {
              select: {
                id: true,
                name: true,
                ownerId: true,
                owner: { select: { firstName: true, lastName: true, email: true } },
              },
            },
          },
        },
        user: { select: { id: true, email: true } },
      },
    });
    return NextResponse.json({ success: true, data: tenants });
  } catch (error) {
    console.error('List tenants error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch tenants' }, { status: 500 });
  }
}

/**
 * POST /api/tenants
 * Management adds a tenant and (optionally) allocates a room to them in one
 * step. The tenant is linked to a login account by email/phone when one exists,
 * and is linked automatically when that person registers later — this is the
 * landlord↔tenant link that lets the tenant see the room they were allocated.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!isManagementRole(session.role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const validated = createTenantSchema.parse(body);
    // Payment-destination text appended to the tenant's allocation notification
    // (set when a room is being allocated below, '' otherwise).
    let payLinesSuffix = '';

    // Normalize once so the stored email/phone matches what the tenant will
    // sign in with (email matching is case-insensitive).
    const email = normalizeEmail(validated.email);
    const phone = normalizePhone(validated.phone) || '';

    // One tenant per person: identify them by email or phone so a landlord
    // onboard cannot silently create a duplicate of the same tenant.
    // Only check non-empty values — empty phones/emails should not collide.
    const duplicateFilters: Prisma.TenantWhereInput[] = [];
    if (email) duplicateFilters.push({ email: { equals: email, mode: 'insensitive' } });
    if (phone && phone.length >= 7) duplicateFilters.push({ phone });
    const existingTenant = duplicateFilters.length > 0
      ? await prisma.tenant.findFirst({ where: { OR: duplicateFilters } })
      : null;
    if (existingTenant) {
      return NextResponse.json(
        {
          success: false,
          error: `${existingTenant.firstName} ${existingTenant.lastName} is already a tenant. Use "Assign Unit" in the tenant list instead.`,
        },
        { status: 400 }
      );
    }

    // Resolve the room being allocated (if any).
    let unit: {
      id: string;
      unitNumber: string;
      monthlyRent: number;
      propertyId: string;
      property: { name: string } | null;
    } | null = null;

    if (validated.unitId) {
      const found = await prisma.unit.findUnique({
        where: { id: validated.unitId },
        include: {
          property: {
            select: {
              name: true,
              mpesaPaybill: true,
              mpesaAccountName: true,
              mpesaTillNumber: true,
              mpesaPhone: true,
            },
          },
          tenants: { select: { id: true, firstName: true, lastName: true, isActive: true } },
        },
      });
      if (!found) {
        return NextResponse.json({ success: false, error: 'Unit not found' }, { status: 404 });
      }

      // A room can only have one active tenant — never double-book it.
      const occupant = found.tenants?.find((t) => t.isActive);
      if (!isVacantUnitStatus(found.status) && occupant) {
        return NextResponse.json(
          {
            success: false,
            error: `Unit ${found.unitNumber} is already occupied by ${occupant.firstName} ${occupant.lastName}. Unassign them first.`,
          },
          { status: 400 }
        );
      }
      if (!isVacantUnitStatus(found.status)) {
        return NextResponse.json(
          { success: false, error: `Unit ${found.unitNumber} is not vacant and cannot be assigned.` },
          { status: 400 }
        );
      }

      unit = {
        id: found.id,
        unitNumber: found.unitNumber,
        monthlyRent: found.monthlyRent,
        propertyId: found.propertyId,
        property: found.property,
      };

      // Collection details shown in the tenant's allocation notification.
      const payLines = formatPaymentInstructions(found.property);
      payLinesSuffix =
        payLines.length > 0
          ? ` Rent is paid to: ${payLines.join('; ')}. The M-Pesa prompt goes to the tenant's phone — they just enter their PIN.`
          : '';
    }

    // Link to an existing login account, if the person has already registered.
    const linkedUser = await findMatchingTenantUser(email, phone);

    const tenant = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          firstName: validated.firstName,
          lastName: validated.lastName,
          email,
          phone,
          idNumber: validated.idNumber || null,
          isActive: true,
          userId: linkedUser?.id ?? null,
          unitId: unit?.id ?? null,
        },
        include: {
          unit: { include: { property: { include: { owner: true } } } },
          user: { select: { id: true, email: true } },
        },
      });

      // Allocating the room makes it occupied and lifts the property counters.
      if (unit) {
        await tx.unit.update({ where: { id: unit.id }, data: { status: 'OCCUPIED' } });
        await tx.property.update({
          where: { id: unit.propertyId },
          data: {
            occupiedUnits: { increment: 1 },
            monthlyIncome: { increment: unit.monthlyRent },
          },
        });
      }

      return created;
    });

    // Tell the tenant which room they got, and tell the landlord (in-app + email).
    try {
      const landlordId = tenant.unit?.property?.ownerId ?? null;
      const roomText = unit
        ? `Room ${unit.unitNumber} at ${unit.property?.name || 'the estate'}`
        : null;

      if (linkedUser && roomText) {
        await prisma.notification.create({
          data: {
            userId: linkedUser.id,
            type: 'ANNOUNCEMENT',
            title: 'You have been allocated a room',
            message: `${roomText} has been allocated to you. Open "My Room" to see it and pay your rent.${payLinesSuffix}`, 
          },
        });
        // Email the tenant about their room allocation.
        const tenantUser = await prisma.user.findUnique({
          where: { id: linkedUser.id },
          select: { email: true, firstName: true, lastName: true },
        });
        if (tenantUser?.email) {
          await sendPortalNoticeEmail({
            to: tenantUser.email,
            recipientName: `${tenantUser.firstName} ${tenantUser.lastName}`.trim() || tenantUser.email,
            subject: 'You have been allocated a room',
            content: `${roomText} has been allocated to you. Log in to Boma Yangu to see your room and pay rent.${payLinesSuffix}`,
            category: 'Room Allocation',
          });
        }
      }

      if (landlordId && landlordId !== session.userId && unit) {
        await prisma.notification.create({
          data: {
            userId: landlordId,
            type: 'ANNOUNCEMENT',
            title: `New tenant on ${unit.unitNumber}`,
            message: `${tenant.firstName} ${tenant.lastName} was added as the tenant for ${roomText}.`,
          },
        });
        // Email the landlord about the new tenant.
        const landlord = await prisma.user.findUnique({
          where: { id: landlordId },
          select: { email: true, firstName: true, lastName: true },
        });
        if (landlord?.email) {
          await sendPortalNoticeEmail({
            to: landlord.email,
            recipientName: `${landlord.firstName} ${landlord.lastName}`.trim() || landlord.email,
            subject: `New tenant on ${unit.unitNumber}`,
            content: `${tenant.firstName} ${tenant.lastName} was added as the tenant for ${roomText}.`,
            category: 'Tenant Update',
          });
        }
      }
    } catch (notifyError) {
      console.error('Add tenant notification error:', notifyError);
    }

    // Log the tenant creation activity
    logActivity({
      action: 'TENANT_ADDED',
      description: `${tenant.firstName} ${tenant.lastName} added as tenant${unit ? ` for unit ${unit.unitNumber}` : ''}`,
      entityType: 'TENANT',
      entityId: tenant.id,
      userId: session.userId,
      propertyId: unit?.propertyId ?? null,
      ipAddress: extractIpAddress(request),
    });

    return NextResponse.json({ success: true, data: tenant }, { status: 201 });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Create tenant error:', error);
    return NextResponse.json({ success: false, error: 'Failed to add tenant' }, { status: 500 });
  }
}
