import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { isManagementRole } from '@/lib/auth/rbac';
import { findMatchingTenantUser, normalizeEmail, normalizePhone } from '@/lib/auth/tenant-scope';
import { canClaimTenantRecord, resolveTenantContact } from '@/lib/auth/tenant-visibility';
import { deriveNameFromEmail } from '@/lib/utils/contact';
import { isVacantUnitStatus } from '@/lib/utils/room-assignment';
import { formatPaymentInstructions } from '@/lib/utils/payment-details';
import { logActivity, extractIpAddress } from '@/lib/db/activity-logger';
import { sendPortalNoticeEmail } from '@/lib/notifications/communication';
import { z } from 'zod';
import type { Tenant } from '@prisma/client';

const assignRoomSchema = z.object({
  // Assign an existing tenant record…
  tenantId: z.string().optional(),
  // …or invite a new tenant with just a contact (name optional).
  email: z.string().email('Enter a valid email').optional().nullable(),
  phone: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  // M-Pesa collection details — accepted for backwards compatibility but
  // IGNORED: the payment destination is locked to the platform Buy Goods till
  // (9062851) and cannot be changed per allocation.
  mpesaPaybill: z.string().trim().optional(),
  mpesaAccountName: z.string().trim().optional(),
  mpesaTillNumber: z.string().trim().optional(),
  mpesaPhone: z.string().trim().optional(),
});

/**
 * POST /api/units/[id]/assign
 *
 * Management assigns a room (unit) to a tenant, straight from the room view.
 * The tenant can be an existing record OR a brand-new person identified only by
 * email/phone — the record is created and held for them. If that person later
 * signs in with the email/phone, `ensureTenantRecord` claims the record and the
 * allocated room appears under "My Room".
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    // Only management allocates rooms — caretakers can monitor, never assign.
    if (!isManagementRole(session.role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const validated = assignRoomSchema.parse(body);

    const unit = await prisma.unit.findUnique({
      where: { id: params.id },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            mpesaPaybill: true,
            mpesaAccountName: true,
            mpesaTillNumber: true,
            mpesaPhone: true,
          },
        },
        tenants: { select: { id: true, firstName: true, lastName: true, isActive: true } },
      },
    });
    if (!unit) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    // A room can only hold one active tenant — never silently double-book it.
    const occupant = unit.tenants?.find((t) => t.isActive) ?? null;
    if (!isVacantUnitStatus(unit.status) && occupant) {
      return NextResponse.json(
        {
          success: false,
          error: `Room ${unit.unitNumber} is already assigned to ${occupant.firstName} ${occupant.lastName}. Unassign them first.`,
        },
        { status: 400 }
      );
    }

    if (!isVacantUnitStatus(unit.status)) {
      return NextResponse.json(
        { success: false, error: `Room ${unit.unitNumber} is not vacant and cannot be assigned.` },
        { status: 400 }
      );
    }

    // ---------- Resolve the tenant ----------
    let tenant: Tenant | null = null;
    let createdNew = false;

    if (validated.tenantId) {
      tenant = await prisma.tenant.findUnique({
        where: { id: validated.tenantId },
        include: { unit: { select: { property: { select: { ownerId: true } } } } },
      });
      if (!tenant) {
        return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
      }
      // Only the landlord who owns the unit or added the tenant may assign to
      // them — never a record belonging to another landlord. An unowned
      // profile (the person registered themselves) is claimed instead.
      if (!canClaimTenantRecord(tenant, session)) {
        return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
      }
      if (tenant.unitId) {
        return NextResponse.json(
          { success: false, error: `${tenant.firstName} ${tenant.lastName} already has a room. Use "Change Unit" to move them.` },
          { status: 400 }
        );
      }
    } else {
      const email = normalizeEmail(validated.email);
      const phone = normalizePhone(validated.phone);
      if (!email && !phone) {
        return NextResponse.json(
          { success: false, error: "Enter the tenant's email or phone number" },
          { status: 400 }
        );
      }

      // Match the entered contact against existing records. EMAIL identifies
      // the person's login account (hard duplicate guard); PHONE does not —
      // households share one number, so a phone match only ever reuses an
      // unassigned record and can never block this landlord from adding their
      // own tenant (the old "already has a room" dead end).
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
        !emailMatch && phone
          ? await prisma.tenant.findFirst({ where: { phone }, include: contactInclude })
          : null;
      const existing = emailMatch ?? phoneMatch;
      const decision = resolveTenantContact(existing, emailMatch ? 'EMAIL' : 'PHONE', session);

      if (decision.action === 'BLOCK') {
        return NextResponse.json(
          { success: false, error: decision.message },
          { status: 400 }
        );
      }

      if (decision.action === 'ADOPT' && existing) {
        // Reuse the unassigned record for the same person instead of duplicating it.
        tenant = existing;
      } else {
        // Email/phone is enough: derive a display name when none was given.
        const firstName =
          validated.firstName?.trim() || deriveNameFromEmail(email) || 'New tenant';
        const lastName = validated.lastName?.trim() || '';
        createdNew = true;
        tenant = await prisma.tenant.create({
          data: {
            firstName,
            lastName,
            email,
            phone: phone || '',
            isActive: true,
            addedById: session.userId,
          },
        });
      }
    }

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Could not resolve the tenant' }, { status: 500 });
    }

    // Link a login account now if the person already has one, so they see the
    // room immediately. Otherwise the record stays "invited" and is claimed
    // when they sign in with this email/phone.
    let userId = tenant.userId;
    if (!userId) {
      const linkedUser = await findMatchingTenantUser(tenant.email, tenant.phone);
      if (linkedUser) userId = linkedUser.id;
    }

    // Payment details sent with the allocation are locked: the tenant is told
    // rent goes to the platform Buy Goods till (9062851), and any landlord
    // paybill/till values in the payload are ignored.
    const payLines = formatPaymentInstructions(null);

    const assigned = await prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id: tenant!.id },
        // addedById claims an unowned profile for this landlord so the tenant
        // stays visible in their list (and nowhere else).
        data: { userId, unitId: unit.id, addedById: tenant!.addedById ?? session.userId },
        include: {
          unit: { include: { property: { include: { owner: true } } } },
          user: { select: { id: true, email: true } },
        },
      });

      await tx.unit.update({ where: { id: unit.id }, data: { status: 'OCCUPIED' } });
      await tx.property.update({
        where: { id: unit.propertyId },
        data: {
          occupiedUnits: { increment: 1 },
          monthlyIncome: { increment: unit.monthlyRent },
        },
      });

      return updated;
    });

    // Tell the tenant about their room (when we can reach their account) and
    // tell the landlord (in-app + email).
    try {
      const landlordId = unit.property?.ownerId || null;
      const roomText = `Room ${unit.unitNumber} at ${unit.property?.name || 'the estate'}`;

      const tenantMessage =
        `${roomText} has been allocated to you. Open "My Room" to see it and pay your rent.` +
        (payLines.length > 0
          ? ` Rent is paid to: ${payLines.join('; ')}. When you tap Pay, the M-Pesa prompt is sent to your phone — just enter your PIN.`
          : '');

      if (userId) {
        await prisma.notification.create({
          data: {
            userId,
            type: 'ANNOUNCEMENT',
            title: createdNew ? 'You have been allocated a room' : 'Room allocated',
            message: tenantMessage,
          },
        });
        // Email the tenant about their room allocation.
        const tenantUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, firstName: true, lastName: true },
        });
        if (tenantUser?.email) {
          await sendPortalNoticeEmail({
            to: tenantUser.email,
            recipientName: `${tenantUser.firstName} ${tenantUser.lastName}`.trim() || tenantUser.email,
            subject: createdNew ? 'You have been allocated a room' : 'Room allocated',
            content: tenantMessage,
            category: 'Room Allocation',
          });
        }
      }

      if (landlordId && landlordId !== session.userId) {
        const landlordMessage = `${assigned.firstName} ${assigned.lastName} was allocated ${roomText}.`;
        await prisma.notification.create({
          data: {
            userId: landlordId,
            type: 'ANNOUNCEMENT',
            title: `Room ${unit.unitNumber} allocated`,
            message: landlordMessage,
          },
        });
        // Email the landlord about the allocation.
        const landlord = await prisma.user.findUnique({
          where: { id: landlordId },
          select: { email: true, firstName: true, lastName: true },
        });
        if (landlord?.email) {
          await sendPortalNoticeEmail({
            to: landlord.email,
            recipientName: `${landlord.firstName} ${landlord.lastName}`.trim() || landlord.email,
            subject: `Room ${unit.unitNumber} allocated`,
            content: landlordMessage,
            category: 'Room Allocation',
          });
        }
      }
    } catch (notifyError) {
      console.error('Assign room notification error:', notifyError);
    }

    // Log the room assignment activity
    logActivity({
      action: 'ROOM_ASSIGNED',
      description: `Room ${unit.unitNumber} assigned to ${assigned.firstName} ${assigned.lastName}`,
      entityType: 'UNIT',
      entityId: unit.id,
      userId: session.userId,
      propertyId: unit.property?.id ?? null,
      ipAddress: extractIpAddress(request),
    });

    return NextResponse.json({ success: true, data: assigned }, { status: 201 });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Assign room error:', error);
    return NextResponse.json({ success: false, error: 'Failed to assign room' }, { status: 500 });
  }
}
