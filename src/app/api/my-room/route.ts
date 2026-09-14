import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';

/**
 * GET /api/my-room
 *
 * The single source of truth for a tenant's own room. A tenant can only ever
 * see the unit the landlord allocated to them — never the estate, never another
 * tenant's unit, payments or balance.
 *
 * Links are derived from the unit (no duplicated ids that can drift):
 *   - landlord  = owner of the unit's property
 *   - caretaker = caretaker(s) assigned to that property
 *
 * Ledger: every room starts at KES 0 for a new tenant. Payments and invoices
 * keep the tenantId of whoever created them, so this endpoint — scoped strictly
 * to the current tenant's id — shows no trace of a previous tenant's completed,
 * pending or failed transactions. The room only starts recording once the new
 * tenant makes a transaction.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'TENANT') {
      return NextResponse.json(
        { success: false, error: 'Only tenants can view their allocated room' },
        { status: 403 }
      );
    }

    const tenant = await ensureTenantRecord(session.userId);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'No tenant profile linked to this account.' },
        { status: 400 }
      );
    }

    const tenantSummary = {
      id: tenant.id,
      firstName: tenant.firstName,
      lastName: tenant.lastName,
      phone: tenant.phone,
      email: tenant.email,
    };

    // No room allocated yet: an empty room, never estate-wide data.
    if (!tenant.unitId) {
      return NextResponse.json({
        success: true,
        data: {
          tenant: tenantSummary,
          unit: null,
          landlord: null,
          caretakers: [],
          lease: null,
          payments: [],
          summary: { outstanding: 0, totalPaid: 0, entryCount: 0 },
        },
      });
    }

    const unit = await prisma.unit.findUnique({
      where: { id: tenant.unitId },
      include: {
        property: {
          include: {
            owner: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true },
            },
            caretakerAssignments: {
              include: {
                caretaker: {
                  select: { id: true, firstName: true, lastName: true, email: true, phone: true },
                },
              },
            },
          },
        },
      },
    });

    // The landlord's M-Pesa collection details for this property — the tenant
    // pays to exactly this paybill/till/number via an STK push.
    const paymentDetails = unit?.property
      ? {
          mpesaPaybill: unit.property.mpesaPaybill,
          mpesaAccountName: unit.property.mpesaAccountName,
          mpesaTillNumber: unit.property.mpesaTillNumber,
          mpesaPhone: unit.property.mpesaPhone,
        }
      : null;

    // Scoped to THIS tenant only (see the header comment): the room ledger is
    // empty until the new tenant transacts.
    const [invoices, payments, lease] = await Promise.all([
      prisma.invoice.findMany({ where: { tenantId: tenant.id } }),
      prisma.payment.findMany({
        where: { tenantId: tenant.id },
        orderBy: { paymentDate: 'desc' },
        take: 50,
        select: {
          id: true,
          amount: true,
          status: true,
          method: true,
          description: true,
          transactionCode: true,
          receiptNumber: true,
          paymentDate: true,
        },
      }),
      prisma.lease.findUnique({ where: { tenantId: tenant.id } }),
    ]);

    const outstanding = invoices
      .filter((i) => i.status === 'SENT' || i.status === 'OVERDUE')
      .reduce((sum, i) => sum + i.balance, 0);
    const totalPaid = payments
      .filter((p) => p.status === 'COMPLETED' || p.status === 'PARTIAL')
      .reduce((sum, p) => sum + p.amount, 0);

    const property = unit?.property ?? null;

    return NextResponse.json({
      success: true,
      data: {
        tenant: tenantSummary,
        unit: unit
          ? {
              id: unit.id,
              unitNumber: unit.unitNumber,
              description: unit.description,
              floorNumber: unit.floorNumber,
              status: unit.status,
              monthlyRent: unit.monthlyRent,
              depositAmount: unit.depositAmount,
              bedrooms: unit.bedrooms,
              bathrooms: unit.bathrooms,
              size: unit.size,
              images: unit.images,
              waterCharge: unit.waterCharge,
              electricityCharge: unit.electricityCharge,
              garbageCharge: unit.garbageCharge,
              serviceCharge: unit.serviceCharge,
              internetCharge: unit.internetCharge,
              parkingCharge: unit.parkingCharge,
              property: property
                ? {
                    id: property.id,
                    name: property.name,
                    address: property.address,
                    city: property.city,
                    state: property.state,
                  }
                : null,
            }
          : null,
        paymentDetails,
        landlord: property?.owner ?? null,
        caretakers: property?.caretakerAssignments?.map((a) => a.caretaker) ?? [],
        lease,
        payments,
        summary: { outstanding, totalPaid, entryCount: invoices.length + payments.length },
      },
    });
  } catch (error) {
    console.error('My room error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch your room' }, { status: 500 });
  }
}
