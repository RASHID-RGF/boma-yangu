import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const [
      totalProperties,
      totalUnits,
      occupiedUnits,
      totalTenants,
      recentPayments,
      pendingMaintenance,
    ] = await Promise.all([
      prisma.property.count(),
      prisma.unit.count(),
      prisma.unit.count({ where: { status: 'OCCUPIED' } }),
      prisma.tenant.count({ where: { isActive: true } }),
      prisma.payment.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          tenant: { select: { firstName: true, lastName: true } },
          unit: { select: { unitNumber: true } },
        },
      }),
      prisma.maintenanceRequest.count({
        where: { status: { in: ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'] } },
      }),
    ]);

    const monthlyRevenue = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: 'COMPLETED',
        paymentDate: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    });

    const outstandingBalances = await prisma.invoice.aggregate({
      _sum: { balance: true },
      where: { status: { in: ['SENT', 'OVERDUE'] } },
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
        monthlyRevenue: monthlyRevenue._sum.amount || 0,
        outstandingBalances: outstandingBalances._sum.balance || 0,
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
