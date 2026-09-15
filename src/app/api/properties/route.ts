import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { isManagementRole } from '@/lib/auth/rbac';
import { logActivity, extractIpAddress } from '@/lib/db/activity-logger';
import { z } from 'zod';

const createPropertySchema = z.object({
  name: z.string().min(2, 'Property name is required'),
  description: z.string().optional(),
  type: z.enum(['APARTMENT', 'BEDSITTER', 'SINGLE_ROOM', 'MAISONETTE', 'COMMERCIAL', 'VILLA', 'TOWNHOUSE']).default('APARTMENT'),
  address: z.string().min(2, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  country: z.string().default('Kenya'),
  // Optional rooms (unit names) created together with the property. Every
  // room starts VACANT with rent 0 until the landlord edits/allocates it.
  units: z
    .array(
      z.object({
        unitNumber: z.string().min(1, 'Room name is required'),
        monthlyRent: z.number().min(0).default(0),
        depositAmount: z.number().min(0).default(0),
      })
    )
    .max(200, 'A property can hold at most 200 rooms')
    .optional(),
  // M-Pesa collection details: where the landlord collects rent for this
  // property. Shown to tenants and used to route the STK push — the tenant
  // only taps Pay and enters their PIN.
  mpesaPaybill: z.string().trim().optional().or(z.literal('')),
  mpesaAccountName: z.string().trim().optional().or(z.literal('')),
  mpesaTillNumber: z.string().trim().optional().or(z.literal('')),
  mpesaPhone: z.string().trim().optional().or(z.literal('')),
});

/** Converts empty strings to null so unused collection details stay clean. */
function orNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Deduplicate room names (case-insensitive) within the same property. */
function dedupeRooms(
  rooms: { unitNumber: string; monthlyRent: number; depositAmount: number }[]
) {
  const seen = new Set<string>();
  return rooms
    .map((r) => ({ ...r, unitNumber: r.unitNumber.trim() }))
    .filter((r) => {
      const key = r.unitNumber.toUpperCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!isManagementRole(session.role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    // Landlords and managers only see their own properties; super admin sees all.
    const where =
      session.role === 'SUPER_ADMIN'
        ? {}
        : {
            OR: [
              { ownerId: session.userId },
              { managerId: session.userId },
            ],
          };

    const properties = await prisma.property.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { units: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: properties });
  } catch (error) {
    console.error('List properties error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch properties' }, { status: 500 });
  }
}

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
    const validated = createPropertySchema.parse(body);

    // Rooms are created together with the property in one transaction so the
    // property never exists without its rooms and the counters stay consistent.
    const rooms = dedupeRooms(validated.units ?? []);

    const property = await prisma.property.create({
      data: {
        name: validated.name,
        description: validated.description || null,
        type: validated.type,
        status: 'VACANT',
        address: validated.address,
        city: validated.city,
        country: validated.country,
        totalUnits: rooms.length,
        occupiedUnits: 0,
        monthlyIncome: 0,
        expenses: 0,
        images: [],
        ownerId: session.userId,
        mpesaPaybill: orNull(validated.mpesaPaybill),
        mpesaAccountName: orNull(validated.mpesaAccountName),
        mpesaTillNumber: orNull(validated.mpesaTillNumber),
        mpesaPhone: orNull(validated.mpesaPhone),
        // Every room starts VACANT so it can be allocated to a tenant.
        units: {
          create: rooms.map((room) => ({
            unitNumber: room.unitNumber,
            monthlyRent: room.monthlyRent,
            depositAmount: room.depositAmount,
            status: 'VACANT',
          })),
        },
      },
      include: { units: true },
    });

    // Log the property creation activity
    logActivity({
      action: 'PROPERTY_CREATED',
      description: `Property "${property.name}" created with ${rooms.length} units`,
      entityType: 'PROPERTY',
      entityId: property.id,
      userId: session.userId,
      propertyId: property.id,
      ipAddress: extractIpAddress(request),
    });

    return NextResponse.json({ success: true, data: property }, { status: 201 });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Create property error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create property' }, { status: 500 });
  }
}
