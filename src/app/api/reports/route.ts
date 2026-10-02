import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { isManagementRole } from '@/lib/auth/rbac';

/** How many months back each period covers (`null` = everything on record). */
const PERIOD_MONTHS: Record<string, number | null> = {
  month: 1,
  quarter: 3,
  year: 12,
  all: null,
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const OPEN_REQUEST_STATUSES = ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'];

/**
 * GET /api/reports?period=month|quarter|year|all
 *
 * Management-only portfolio report: revenue, collection rate, occupancy,
 * arrears, maintenance breakdown and a per-property performance table.
 * Scoped to the landlord's own properties (everything for a super admin).
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!isManagementRole(session.role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const periodKey = (searchParams.get('period') || 'year').toLowerCase();
    const periodMonths = PERIOD_MONTHS[periodKey] ?? 12;

    // Scope to this landlord's properties (super admin sees the whole estate).
    let propertyIds: string[] | null = null;
    if (session.role !== 'SUPER_ADMIN') {
      const owned = await prisma.property.findMany({
        where: { OR: [{ ownerId: session.userId }, { managerId: session.userId }] },
        select: { id: true },
      });
      propertyIds = owned.map((p) => p.id);
    }
    const propertyScope = propertyIds ? { propertyId: { in: propertyIds } } : {};
    const unitScope = propertyIds ? { unit: { propertyId: { in: propertyIds } } } : {};

    const now = new Date();
    const periodStart =
      periodMonths === null
        ? new Date(2000, 0, 1)
        : new Date(now.getFullYear(), now.getMonth() - (periodMonths - 1), 1);
    // The trend always shows the last 12 months; data starts at the earlier of
    // the two so one query serves both the KPIs and the chart.
    const trendStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const dataStart = periodStart < trendStart ? periodStart : trendStart;

    const [properties, units, payments, invoices, tenants, maintenance] = await Promise.all([
      prisma.property.findMany({
        where: propertyIds ? { id: { in: propertyIds } } : {},
        select: { id: true, name: true, city: true },
      }),
      prisma.unit.findMany({
        where: propertyScope,
        select: { id: true, propertyId: true, status: true, monthlyRent: true },
      }),
      prisma.payment.findMany({
        where: { paymentDate: { gte: dataStart }, ...unitScope },
        orderBy: { paymentDate: 'desc' },
        select: {
          id: true,
          amount: true,
          status: true,
          method: true,
          paymentDate: true,
          receiptNumber: true,
          unit: { select: { propertyId: true, unitNumber: true } },
          tenant: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.invoice.findMany({
        where: unitScope,
        select: {
          id: true,
          totalAmount: true,
          balance: true,
          status: true,
          dueDate: true,
          unit: { select: { propertyId: true } },
        },
      }),
      prisma.tenant.findMany({
        where: { isActive: true, ...(propertyIds ? { unit: { propertyId: { in: propertyIds } } } : {}) },
        select: { id: true, unit: { select: { propertyId: true } } },
      }),
      prisma.maintenanceRequest.findMany({
        where: { createdAt: { gte: dataStart }, ...unitScope },
        select: { status: true, priority: true, unit: { select: { propertyId: true } } },
      }),
    ]);

    // ---- Period totals -------------------------------------------------
    const inPeriod = (date: Date) => date >= periodStart;
    const periodPayments = payments.filter((p) => inPeriod(p.paymentDate));
    // "Money actually received" — the same rule the payments and My Room
    // screens use to count a settled payment.
    const collected = periodPayments.filter((p) => p.status === 'COMPLETED' || p.status === 'PARTIAL');
    const revenue = collected.reduce((sum, p) => sum + p.amount, 0);
    const billed = invoices.filter((i) => inPeriod(i.dueDate)).reduce((sum, i) => sum + i.totalAmount, 0);
    const outstanding = invoices
      .filter((i) => i.status === 'SENT' || i.status === 'OVERDUE')
      .reduce((sum, i) => sum + i.balance, 0);
    const collectionRate = billed > 0 ? Math.min(100, (revenue / billed) * 100) : null;

    const totalUnits = units.length;
    const occupiedUnits = units.filter((u) => u.status === 'OCCUPIED').length;
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    // ---- 12-month collection trend -------------------------------------
    const trend = Array.from({ length: 12 }, (_, idx) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 11 + idx, 1);
      return {
        label: MONTH_LABELS[date.getMonth()],
        year: date.getFullYear(),
        month: date.getMonth(),
        amount: 0,
      };
    });
    const trendIndex = new Map(trend.map((m, i) => [`${m.year}-${m.month}`, i]));
    for (const payment of collected) {
      const index = trendIndex.get(`${payment.paymentDate.getFullYear()}-${payment.paymentDate.getMonth()}`);
      if (index !== undefined) trend[index].amount += payment.amount;
    }

    // ---- Payment methods (period) --------------------------------------
    const methodMap = new Map<string, { count: number; amount: number }>();
    for (const payment of collected) {
      const entry = methodMap.get(payment.method) || { count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += payment.amount;
      methodMap.set(payment.method, entry);
    }
    const methods = Array.from(methodMap.entries())
      .map(([method, value]) => ({ method, ...value }))
      .sort((a, b) => b.amount - a.amount);

    // ---- Maintenance breakdown (trend window) ---------------------------
    const byStatus: Record<string, number> = {
      REPORTED: 0,
      ASSIGNED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    for (const request_ of maintenance) byStatus[request_.status] = (byStatus[request_.status] || 0) + 1;
    const openRequests = OPEN_REQUEST_STATUSES.reduce((sum, status) => sum + (byStatus[status] || 0), 0);
    const urgentOpen = maintenance.filter(
      (m) => m.priority === 'URGENT' && !['COMPLETED', 'CANCELLED'].includes(m.status)
    ).length;

    // ---- Per-property performance ---------------------------------------
    const groupCount = <T extends { unit: { propertyId: string | null } | null }>(
      rows: T[],
      propertyIdOf: (row: T) => string | null
    ) => {
      const map = new Map<string, number>();
      for (const row of rows) {
        const id = propertyIdOf(row);
        if (!id) continue;
        map.set(id, (map.get(id) || 0) + 1);
      }
      return map;
    };

    const unitsPerProperty = new Map<string, number>();
    const occupiedPerProperty = new Map<string, number>();
    for (const unit of units) {
      unitsPerProperty.set(unit.propertyId, (unitsPerProperty.get(unit.propertyId) || 0) + 1);
      if (unit.status === 'OCCUPIED') {
        occupiedPerProperty.set(unit.propertyId, (occupiedPerProperty.get(unit.propertyId) || 0) + 1);
      }
    }
    const revenuePerProperty = new Map<string, number>();
    for (const payment of collected) {
      const id = payment.unit?.propertyId;
      if (!id) continue;
      revenuePerProperty.set(id, (revenuePerProperty.get(id) || 0) + payment.amount);
    }
    const outstandingPerProperty = new Map<string, number>();
    for (const invoice of invoices) {
      if (invoice.status !== 'SENT' && invoice.status !== 'OVERDUE') continue;
      const id = invoice.unit?.propertyId;
      if (!id) continue;
      outstandingPerProperty.set(id, (outstandingPerProperty.get(id) || 0) + invoice.balance);
    }
    const tenantsPerProperty = groupCount(tenants, (t) => t.unit?.propertyId ?? null);

    const propertyRows = properties.map((property) => {
      const unitsForProperty = unitsPerProperty.get(property.id) || 0;
      const occupiedForProperty = occupiedPerProperty.get(property.id) || 0;
      return {
        id: property.id,
        name: property.name,
        city: property.city,
        units: unitsForProperty,
        occupied: occupiedForProperty,
        vacant: unitsForProperty - occupiedForProperty,
        occupancyRate: unitsForProperty > 0 ? (occupiedForProperty / unitsForProperty) * 100 : 0,
        revenue: revenuePerProperty.get(property.id) || 0,
        outstanding: outstandingPerProperty.get(property.id) || 0,
        tenants: tenantsPerProperty.get(property.id) || 0,
      };
    });
    propertyRows.sort((a, b) => b.revenue - a.revenue);

    // ---- Payment ledger (period) — also what the CSV export downloads ----
    const ledger = periodPayments.map((payment) => ({
      paymentDate: payment.paymentDate.toISOString(),
      amount: payment.amount,
      status: payment.status,
      method: payment.method,
      receiptNumber: payment.receiptNumber,
      tenant: [payment.tenant?.firstName, payment.tenant?.lastName].filter(Boolean).join(' ') || null,
      unit: payment.unit?.unitNumber || null,
      property: properties.find((p) => p.id === payment.unit?.propertyId)?.name || null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        period: { key: periodKey, from: periodStart.toISOString(), to: now.toISOString() },
        summary: {
          revenue,
          paymentCount: collected.length,
          billed,
          collectionRate,
          outstanding,
          totalUnits,
          occupiedUnits,
          vacantUnits: totalUnits - occupiedUnits,
          occupancyRate,
          activeTenants: tenants.length,
          openRequests,
          urgentOpen,
          maintenanceTotal: maintenance.length,
        },
        trend,
        methods,
        maintenance: { byStatus, total: maintenance.length },
        properties: propertyRows,
        ledger,
      },
    });
  } catch (error) {
    console.error('Reports error:', error);
    return NextResponse.json({ success: false, error: 'Failed to build report' }, { status: 500 });
  }
}
