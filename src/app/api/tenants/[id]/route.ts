import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { isManagementRole } from '@/lib/auth/rbac';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const updateTenantSchema = z.object({
  // Assign (or change) the tenant's unit. Pass null/'' to remove the unit.
  unitId: z.string().min(1).nullable().optional(),
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().nullable(),
});

/**
 * PATCH /api/tenants/[id]
 * Management assigns a unit to a tenant (or updates basic profile fields).
 * This is what links a tenant to a landlord: a unit belongs to a property,
 * and the property owner is that tenant's landlord — the tenant then pays
 * against their own unit and the landlord receives the payment notifications.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!isManagementRole(session.role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const validated = updateTenantSchema.parse(body);

    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      include: {
        unit: { include: { property: true } },
        user: true,
      },
    });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // ---- Resolve the new unit (if being assigned/changed) ----
    let newUnitId = validated.unitId !== undefined ? validated.unitId || null : tenant.unitId;
    let newUnit = null;
    let newUnitProperty = null;

    if (newUnitId && newUnitId !== tenant.unitId) {
      newUnit = await prisma.unit.findUnique({
        where: { id: newUnitId },
        include: {
          property: true,
          tenants: { select: { id: true, firstName: true, lastName: true, isActive: true } },
        },
      });
      if (!newUnit) {
        return NextResponse.json({ success: false, error: 'Unit not found' }, { status: 404 });
      }
      newUnitProperty = newUnit.property;

      // A unit can only have one active tenant — never silently double-book it.
      // Best-effort pre-check (outside the transaction): two concurrent
      // assignments could still race past it, which is acceptable here.
      const otherOccupant = newUnit.tenants?.find(
        (t) => t.id !== tenant.id && t.isActive
      );
      if (otherOccupant) {
        return NextResponse.json(
          {
            success: false,
            error: `Unit ${newUnit.unitNumber} is already occupied by ${otherOccupant.firstName} ${otherOccupant.lastName}. Unassign them first.`,
          },
          { status: 400 }
        );
      }
    }

    const oldUnit = tenant.unit;
    const unitChanged = newUnitId !== (tenant.unitId || null);

    // ---- Apply the update atomically ----
    const updated = await prisma.$transaction(async (tx) => {
      // Update the tenant profile / unit link. The unit is a relation, so it
      // is connected/disconnected rather than set via a scalar id.
      const data: Prisma.TenantUpdateInput = {};
      if (validated.firstName) data.firstName = validated.firstName;
      if (validated.lastName) data.lastName = validated.lastName;
      if (validated.phone) data.phone = validated.phone;
      if (validated.email !== undefined) data.email = validated.email || null;
      if (unitChanged) {
        data.unit = newUnitId ? { connect: { id: newUnitId } } : { disconnect: true };
      }

      const updatedTenant = await tx.tenant.update({
        where: { id: tenant.id },
        data,
        include: {
          unit: { include: { property: { include: { owner: true } } } },
          user: { select: { id: true, email: true } },
        },
      });

      if (unitChanged) {
        // Old unit becomes vacant (if the tenant was moved out). Counters are
        // floored at 0 so stale seed data can never drive them negative.
        if (oldUnit) {
          await tx.unit.update({
            where: { id: oldUnit.id },
            data: { status: 'VACANT' },
          });
          if (oldUnit.propertyId !== newUnitProperty?.id) {
            const oldProp = await tx.property.findUnique({
              where: { id: oldUnit.propertyId },
              select: { occupiedUnits: true, monthlyIncome: true },
            });
            await tx.property.update({
              where: { id: oldUnit.propertyId },
              data: {
                occupiedUnits: Math.max(0, (oldProp?.occupiedUnits || 0) - 1),
                monthlyIncome: Math.max(0, (oldProp?.monthlyIncome || 0) - oldUnit.monthlyRent),
              },
            });
          }
        }

        // New unit becomes occupied.
        if (newUnit) {
          await tx.unit.update({
            where: { id: newUnit.id },
            data: { status: 'OCCUPIED' },
          });
          if (!oldUnit || oldUnit.propertyId !== newUnit.propertyId) {
            await tx.property.update({
              where: { id: newUnit.propertyId },
              data: {
                occupiedUnits: { increment: 1 },
                monthlyIncome: { increment: newUnit.monthlyRent },
              },
            });
          }
        }
      }

      return updatedTenant;
    });

    // ---- Notifications ----
    try {
      const landlordId = updated.unit?.property?.ownerId || null;

      // Tell the tenant about their new unit (the tenant is now linked to the
      // landlord who owns the unit's property).
      if (tenant.userId && unitChanged) {
        await prisma.notification.create({
          data: {
            userId: tenant.userId,
            type: 'ANNOUNCEMENT',
            title: 'Unit assigned',
            message: newUnit
              ? `You have been assigned unit ${newUnit.unitNumber} at ${newUnitProperty?.name || 'the estate'}. You can now pay rent for your unit in the Payments section.`
              : 'Your unit assignment was removed. Contact management if this is unexpected.',
          },
        });
      }

      // Tell the landlord they have a new tenant on their unit.
      if (landlordId && landlordId !== session.userId && unitChanged && newUnit) {
        await prisma.notification.create({
          data: {
            userId: landlordId,
            type: 'ANNOUNCEMENT',
            title: `New tenant on ${newUnit.unitNumber}`,
            message: `${updated.firstName} ${updated.lastName} was assigned unit ${newUnit.unitNumber} at ${newUnitProperty?.name || 'your property'}.`,
          },
        });
      }
    } catch (notifyError) {
      console.error('Tenant unit-assignment notification error:', notifyError);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Update tenant error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update tenant' }, { status: 500 });
  }
}
