import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { OPERATIONS_ROLES } from '@/lib/auth/rbac';

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

    const units = await prisma.unit.findMany({
      include: {
        property: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            owner: { select: { firstName: true, lastName: true } },
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
