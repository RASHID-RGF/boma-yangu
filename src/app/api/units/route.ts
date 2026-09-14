import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { OPERATIONS_ROLES, isManagementRole } from '@/lib/auth/rbac';
import { isPalplussConfigured } from '@/lib/payments/finalize';
import { getPalpluss, PalPlussApiError } from '@/lib/payments/palpluss';
import { z } from 'zod';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    // The /units route is open to OPERATIONS_ROLES (management + caretakers),
    // so the API must match.
    if (!session.role || !(OPERATIONS_ROLES as string[]).includes(session.role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    // Scope to the landlord's own properties (or all for super admin).
    const propertyWhere =
      session.role === 'SUPER_ADMIN'
        ? {}
        : session.role === 'LANDLORD' || session.role === 'MANAGER'
          ? {
              OR: [
                { ownerId: session.userId },
                { managerId: session.userId },
              ],
            }
          : {};

    const units = await prisma.unit.findMany({
      where: { property: propertyWhere },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            managerId: true,
            owner: { select: { firstName: true, lastName: true } },
            mpesaPaybill: true,
            mpesaAccountName: true,
            mpesaTillNumber: true,
            mpesaPhone: true,
          },
        },
        tenants: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            userId: true,
          },
        },
      },
    });

    // Sort in JS (grouped by property, then by unit number) because Prisma's
    // MongoDB connector does not support ordering by relation fields.
    units.sort((a, b) => {
      const pa = a.property?.name ?? '';
      const pb = b.property?.name ?? '';
      if (pa !== pb) return pa.localeCompare(pb);
      return a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true });
    });

    return NextResponse.json({ success: true, data: units });
  } catch (error) {
    console.error('List units error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch units' }, { status: 500 });
  }
}

const createUnitSchema = z.object({
  propertyId: z.string().min(1, 'Property is required'),
  unitNumber: z.string().min(1, 'Unit number is required'),
  description: z.string().optional(),
  floorNumber: z.number().optional(),
  // Rent/deposit are optional so the landlord can create a room by name only
  // (e.g. "Room A") and set rent later, before or after allocating a tenant.
  monthlyRent: z.number().min(0).default(0),
  depositAmount: z.number().min(0).default(0),
  waterCharge: z.number().min(0).default(0),
  electricityCharge: z.number().min(0).default(0),
  garbageCharge: z.number().min(0).default(0),
  serviceCharge: z.number().min(0).default(0),
  internetCharge: z.number().min(0).default(0),
  parkingCharge: z.number().min(0).default(0),
  bedrooms: z.number().min(0).default(1),
  bathrooms: z.number().min(0).default(1),
  size: z.number().optional(),
  // Landlord's M-Pesa collection details for this unit's property. When
  // supplied, they are applied to the property AND registered as this
  // landlord's PalPluss payment channel so STK pushes for this property
  // reach the landlord's own till/paybill.
  mpesaPaybill: z.string().trim().optional().or(z.literal('')),
  mpesaAccountName: z.string().trim().optional().or(z.literal('')),
  mpesaTillNumber: z.string().trim().optional().or(z.literal('')),
  mpesaPhone: z.string().trim().optional().or(z.literal('')),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!isManagementRole(session.role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const validated = createUnitSchema.parse(body);

    // Verify the property belongs to this landlord (or they are super admin).
    const property = await prisma.property.findUnique({ where: { id: validated.propertyId } });
    if (!property) {
      return NextResponse.json({ success: false, error: 'Property not found' }, { status: 404 });
    }
    if (session.role !== 'SUPER_ADMIN' && property.ownerId !== session.userId && property.managerId !== session.userId) {
      return NextResponse.json({ success: false, error: 'You do not own this property' }, { status: 403 });
    }

    // Check for duplicate unit number within the same property.
    const existing = await prisma.unit.findFirst({
      where: { propertyId: validated.propertyId, unitNumber: validated.unitNumber },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Unit ${validated.unitNumber} already exists in this property` },
        { status: 400 }
      );
    }

    const unit = await prisma.$transaction(async (tx) => {
      const created = await tx.unit.create({
        data: {
          unitNumber: validated.unitNumber,
          description: validated.description || null,
          floorNumber: validated.floorNumber ?? null,
          monthlyRent: validated.monthlyRent,
          depositAmount: validated.depositAmount,
          waterCharge: validated.waterCharge,
          electricityCharge: validated.electricityCharge,
          garbageCharge: validated.garbageCharge,
          serviceCharge: validated.serviceCharge,
          internetCharge: validated.internetCharge,
          parkingCharge: validated.parkingCharge,
          bedrooms: validated.bedrooms,
          bathrooms: validated.bathrooms,
          size: validated.size ?? null,
          status: 'VACANT',
          propertyId: validated.propertyId,
        },
      });

      // Update property unit count.
      await tx.property.update({
        where: { id: validated.propertyId },
        data: { totalUnits: { increment: 1 } },
      });

      // Best-effort: if the landlord supplied any M-Pesa collection details with
      // this room, surface them on the property AND register a dedicated PalPluss
      // payment channel so this landlord's own till/paybill receives the STK push.
      // Non-critical — the room is created even when channel registration fails.
      try {
        const tillNumber =
          validated.mpesaTillNumber && validated.mpesaTillNumber.trim();
        const paybillNumber =
          validated.mpesaPaybill && validated.mpesaPaybill.trim();
        const shortcode = tillNumber || paybillNumber;
        if (shortcode && isPalplussConfigured()) {
          const channelType = tillNumber ? 'TILL' : 'PAYBILL';
          const client = getPalpluss();
          const channel = await client.createChannel({
            type: channelType,
            shortcode,
            name: validated.mpesaAccountName?.trim() || validated.unitNumber,
            accountNumber: undefined,
            isDefault: false,
          });

          await tx.property.update({
            where: { id: validated.propertyId },
            data: {
              palplussChannelId: channel.id,
              mpesaTillNumber: channelType === 'TILL' ? shortcode : undefined,
              mpesaPaybill: channelType === 'PAYBILL' ? shortcode : undefined,
              mpesaAccountName: validated.mpesaAccountName?.trim() || undefined,
            },
          });
        }
      } catch (channelError) {
        console.warn('Best-effort unit till/paybill channel registration failed:', channelError);
      }


      return created;
    });

    return NextResponse.json({ success: true, data: unit }, { status: 201 });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Create unit error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create unit' }, { status: 500 });
  }
}
