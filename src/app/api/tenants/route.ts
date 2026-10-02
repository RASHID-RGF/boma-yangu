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
import { getTenantScopeWhere, resolveTenantContact } from '@/lib/auth/tenant-visibility';
import { isVacantUnitStatus } from '@/lib/utils/room-assignment';
import { formatPaymentInstructions } from '@/lib/utils/payment-details';
import { logActivity, extractIpAddress } from '@/lib/db/activity-logger';
import { sendPortalNoticeEmail } from '@/lib/notifications/communication';
import { z } from 'zod';

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
      // Only tenants this user owns or added: occupants of their units, plus
      // records they added that have no unit yet. A Tenant profile created by
      // someone registering themselves has neither a unit nor an addedById, so
      // it belongs to nobody and never shows up in a landlord's list.
      const tenantWhere = getTenantScopeWhere(session);

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

    // One record per person — but EMAIL and PHONE are not equivalent:
    //   EMAIL → identifies the login account, so it is a hard duplicate guard
    //           (unassigned records are adopted, real duplicates blocked with
    //           actionable guidance).
    //   PHONE → shared within a household; it may reuse an unassigned record
    //           but NEVER blocks a landlord from adding their own tenant. The
    //           old phone-based block left landlords with "already has a room /
    //           use Change Unit" dead ends for records they could not even see.
    const contactInclude = {
      unit: { select: { property: { select: { ownerId: true } } } },
    } as const;
    const emailMatch = email
      ? await prisma.tenant.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
          include: contactInclude,
        })
      : null;
    const phoneMatch =
      !emailMatch && phone && phone.length >= 7
        ? await prisma.tenant.findFirst({ where: { phone }, include: contactInclude })
        : null;
    const existingTenant = emailMatch ?? phoneMatch;

    const decision = resolveTenantContact(existingTenant, emailMatch ? 'EMAIL' : 'PHONE', session);
    if (decision.action === 'BLOCK') {
      return NextResponse.json(
        { success: false, error: decision.message },
        { status: 400 }
      );
    }
    // ADOPT reuses the unassigned record (this landlord's pending invite or the
    // profile the person created by registering) instead of duplicating it.
    const claimableTenant = decision.action === 'ADOPT' ? existingTenant : null;

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
      // Either create a brand-new record or claim the unowned profile the
      // person created when they registered (addedById marks it as this
      // landlord's tenant, which is what makes it visible in their list).
      const created = claimableTenant
        ? await tx.tenant.update({
            where: { id: claimableTenant.id },
            data: {
              addedById: session.userId,
              // Keep the account already linked to this profile; only fall
              // back to a freshly matched login when the record has none.
              userId: claimableTenant.userId ?? linkedUser?.id ?? null,
              ...(unit ? { unitId: unit.id } : {}),
              ...(validated.idNumber && !claimableTenant.idNumber
                ? { idNumber: validated.idNumber }
                : {}),
            },
            include: {
              unit: { include: { property: { include: { owner: true } } } },
              user: { select: { id: true, email: true } },
            },
          })
        : await tx.tenant.create({
            data: {
              firstName: validated.firstName,
              lastName: validated.lastName,
              email,
              phone,
              idNumber: validated.idNumber || null,
              isActive: true,
              addedById: session.userId,
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

      // Notify the account this record ends up linked to — the freshly matched
      // login for a new record, or the account already behind a claimed profile.
      const tenantAccountId = tenant.userId ?? null;

      if (tenantAccountId && roomText) {
        await prisma.notification.create({
          data: {
            userId: tenantAccountId,
            type: 'ANNOUNCEMENT',
            title: 'You have been allocated a room',
            message: `${roomText} has been allocated to you. Open "My Room" to see it and pay your rent.${payLinesSuffix}`, 
          },
        });
        // Email the tenant about their room allocation.
        const tenantUser = await prisma.user.findUnique({
          where: { id: tenantAccountId },
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
