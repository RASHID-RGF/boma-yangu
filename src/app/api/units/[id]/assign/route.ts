import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { isManagementRole } from '@/lib/auth/rbac';
import { findMatchingTenantUser, normalizeEmail, normalizePhone } from '@/lib/auth/tenant-scope';
import { deriveNameFromEmail } from '@/lib/utils/contact';
import { isVacantUnitStatus } from '@/lib/utils/room-assignment';
import { formatPaymentInstructions } from '@/lib/utils/payment-details';
import { z } from 'zod';
import type { Prisma, Tenant } from '@prisma/client';

const assignRoomSchema = z.object({
  // Assign an existing tenant record…
  tenantId: z.string().optional(),
  // …or invite a new tenant with just a contact (name optional).
  email: z.string().email('Enter a valid email').optional().nullable(),
  phone: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  // M-Pesa collection details for the property, sent along with the allocation
  // so the tenant immediately knows where rent goes — and the STK push is
  // routed to the landlord's paybill/till. Empty strings mean "leave unchanged".
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
      tenant = await prisma.tenant.findUnique({ where: { id: validated.tenantId } });
      if (!tenant) {
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

      // Reuse an existing record for the same person instead of duplicating it.
      const filters: Prisma.TenantWhereInput[] = [];
      if (email) filters.push({ email: { equals: email, mode: 'insensitive' } });
      if (phone) filters.push({ phone });
      const existing = await prisma.tenant.findFirst({ where: { OR: filters } });

      if (existing) {
        if (existing.unitId) {
          return NextResponse.json(
            { success: false, error: `${existing.firstName} ${existing.lastName} already has a room. Use "Change Unit" to move them.` },
            { status: 400 }
          );
        }
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

    // Persist any collection details sent with the allocation, so the STK
    // push is routed to the landlord's paybill/till and the tenant sees exactly
    // where their rent goes.
    const paymentPatch: Prisma.PropertyUpdateInput = {};
    if (validated.mpesaPaybill !== undefined)
      paymentPatch.mpesaPaybill = validated.mpesaPaybill || null;
    if (validated.mpesaAccountName !== undefined)
      paymentPatch.mpesaAccountName = validated.mpesaAccountName || null;
    if (validated.mpesaTillNumber !== undefined)
      paymentPatch.mpesaTillNumber = validated.mpesaTillNumber || null;
    if (validated.mpesaPhone !== undefined)
      paymentPatch.mpesaPhone = validated.mpesaPhone || null;
    if (Object.keys(paymentPatch).length > 0 && unit.property) {
      await prisma.property.update({ where: { id: unit.property.id }, data: paymentPatch });
    }

    // Effective collection details (existing + any just updated) for the
    // tenant-facing notification.
    const paymentDetails = {
      mpesaPaybill:
        validated.mpesaPaybill !== undefined ? validated.mpesaPaybill : unit.property?.mpesaPaybill,
      mpesaAccountName:
        validated.mpesaAccountName !== undefined
          ? validated.mpesaAccountName
          : unit.property?.mpesaAccountName,
      mpesaTillNumber:
        validated.mpesaTillNumber !== undefined
          ? validated.mpesaTillNumber
          : unit.property?.mpesaTillNumber,
      mpesaPhone:
        validated.mpesaPhone !== undefined ? validated.mpesaPhone : unit.property?.mpesaPhone,
    };
    const payLines = formatPaymentInstructions(paymentDetails);

    const assigned = await prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id: tenant!.id },
        data: { userId, unitId: unit.id },
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
    // tell the landlord.
    try {
      const landlordId = unit.property?.ownerId || null;
      const roomText = `Room ${unit.unitNumber} at ${unit.property?.name || 'the estate'}`;

      if (userId) {
        await prisma.notification.create({
          data: {
            userId,
            type: 'ANNOUNCEMENT',
            title: createdNew ? 'You have been allocated a room' : 'Room allocated',
            message:
              `${roomText} has been allocated to you. Open "My Room" to see it and pay your rent.` +
              (payLines.length > 0
                ? ` Rent is paid to: ${payLines.join('; ')}. When you tap Pay, the M-Pesa prompt is sent to your phone — just enter your PIN.`
                : ''),
          },
        });
      }

      if (landlordId && landlordId !== session.userId) {
        await prisma.notification.create({
          data: {
            userId: landlordId,
            type: 'ANNOUNCEMENT',
            title: `Room ${unit.unitNumber} allocated`,
            message: `${assigned.firstName} ${assigned.lastName} was allocated ${roomText}.`,
          },
        });
      }
    } catch (notifyError) {
      console.error('Assign room notification error:', notifyError);
    }

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
