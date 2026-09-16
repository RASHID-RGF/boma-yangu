import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // TENANT: strictly their own room and money. Never estate-wide totals or
    // another tenant's payments — see GET /api/my-room for their room view.
    if (session.role === 'TENANT') {
      const tenant = await ensureTenantRecord(session.userId);
      const empty = {
        totalProperties: 0,
        totalUnits: 0,
        occupiedUnits: 0,
        vacantUnits: 0,
        totalTenants: tenant ? 1 : 0,
        monthlyRevenue: 0,
        outstandingBalances: 0,
        occupancyRate: 0,
        expectedIncome: 0,
        maintenanceExpenses: 0,
        pendingMaintenance: 0,
        recentPayments: [] as unknown[],
        rentCollectionTrend: [],
        incomeVsExpenses: [],
        propertyOccupancy: [],
        recentActivities: [],
      };

      if (!tenant) {
        return NextResponse.json({ success: true, data: empty });
      }

      const [invoices, payments, pendingMaintenance] = await Promise.all([
        prisma.invoice.findMany({ where: { tenantId: tenant.id } }),
        prisma.payment.findMany({
          where: { tenantId: tenant.id },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            tenant: { select: { firstName: true, lastName: true } },
            unit: { select: { unitNumber: true } },
          },
        }),
        prisma.maintenanceRequest.count({
          where: {
            tenantId: tenant.id,
            status: { in: ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'] },
          },
        }),
      ]);

      const outstandingBalances = invoices
        .filter((i) => i.status === 'SENT' || i.status === 'OVERDUE')
        .reduce((sum, i) => sum + i.balance, 0);
      const hasRoom = !!tenant.unitId;

      return NextResponse.json({
        success: true,
        data: {
          ...empty,
          totalProperties: hasRoom ? 1 : 0,
          totalUnits: hasRoom ? 1 : 0,
          occupiedUnits: hasRoom ? 1 : 0,
          occupancyRate: hasRoom ? 100 : 0,
          outstandingBalances,
          pendingMaintenance,
          recentPayments: payments,
          // The room the landlord allocated to this tenant (null until then).
          allocatedRoom: tenant.unit
            ? {
                unitNumber: tenant.unit.unitNumber,
                propertyName: tenant.unit.property?.name ?? null,
              }
            : null,
        },
      });
    }

    // Scope to the landlord's own properties (or all for super admin).
    const isScopedLandlord = session.role === 'LANDLORD';
    let scopedPropertyIds: string[] | null = null;
    let propertyWhere = {};

    if (isScopedLandlord) {
      const ownedProperties = await prisma.property.findMany({
        where: {
          ownerId: session.userId,
        },
        select: { id: true },
      });
      scopedPropertyIds = ownedProperties.map((p) => p.id);
      propertyWhere = { id: { in: scopedPropertyIds } };
    }

    // Unit-level filter: units belonging to scoped properties.
    const unitWhere = scopedPropertyIds ? { propertyId: { in: scopedPropertyIds } } : {};

    const [
      totalProperties,
      totalUnits,
      occupiedUnits,
      totalTenants,
      recentPayments,
      pendingMaintenance,
    ] = await Promise.all([
      prisma.property.count({ where: propertyWhere }),
      prisma.unit.count({ where: unitWhere }),
      prisma.unit.count({ where: { status: 'OCCUPIED', ...unitWhere } }),
      prisma.tenant.count({
        where: {
          isActive: true,
          ...(scopedPropertyIds ? { unit: { propertyId: { in: scopedPropertyIds } } } : {}),
        },
      }),
      prisma.payment.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        where: scopedPropertyIds ? { unit: { propertyId: { in: scopedPropertyIds } } } : {},
        include: {
          tenant: { select: { firstName: true, lastName: true } },
          unit: { select: { unitNumber: true } },
        },
      }),
      prisma.maintenanceRequest.count({
        where: {
          status: { in: ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'] },
          ...(scopedPropertyIds ? { unit: { propertyId: { in: scopedPropertyIds } } } : {}),
        },
      }),
    ]);

    const monthlyRevenue = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: 'COMPLETED',
        paymentDate: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
        ...(scopedPropertyIds ? { unit: { propertyId: { in: scopedPropertyIds } } } : {}),
      },
    });

    const outstandingBalances = await prisma.invoice.aggregate({
      _sum: { balance: true },
      where: {
        status: { in: ['SENT', 'OVERDUE'] },
        ...(scopedPropertyIds ? { unit: { propertyId: { in: scopedPropertyIds } } } : {}),
      },
    });

    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        totalProperties,
        totalUnits,
        occupiedUnits,
        vacantUnits: totalUnits - occupiedUnits,
        totalTenants,
        monthlyRevenue: monthlyRevenue?._sum?.amount || 0,
        outstandingBalances: outstandingBalances?._sum?.balance || 0,
        occupancyRate,
        expectedIncome: totalUnits * 50000, // Average rent estimate
        maintenanceExpenses: 0,
        pendingMaintenance,
        recentPayments: recentPayments.map((p) => ({
          ...p,
          tenant: p.tenant,
          unit: p.unit,
        })),
        rentCollectionTrend: [],
        incomeVsExpenses: [],
        propertyOccupancy: [],
        recentActivities: [],
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
