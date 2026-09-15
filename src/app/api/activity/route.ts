import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { isManagementRole } from '@/lib/auth/rbac';

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
    const limit = parseInt(searchParams.get('limit') || '50');
    const action = searchParams.get('action') || '';
    const entityType = searchParams.get('entityType') || '';
    const userId = searchParams.get('userId') || '';

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (userId) where.userId = userId;

    // Scope to the landlord's own properties (or all for super admin).
    if (session.role !== 'SUPER_ADMIN') {
      const properties = await prisma.property.findMany({
        where: {
          OR: [
            { ownerId: session.userId },
            { managerId: session.userId },
          ],
        },
        select: { id: true },
      });
      const propertyIds = properties.map((p) => p.id);
      where.OR = [
        { userId: session.userId },
        { propertyId: { in: propertyIds } },
      ];
    }

    const activities = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, role: true },
        },
      },
    });

    // Also fetch audit logs for admin/landlord
    const auditLogs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Get summary stats
    const stats = {
      totalActivities: await prisma.activityLog.count(),
      todayActivities: await prisma.activityLog.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      loginCount: await prisma.activityLog.count({
        where: { action: 'USER_LOGIN' },
      }),
      byAction: await prisma.activityLog.groupBy({
        by: ['action'],
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
    };

    return NextResponse.json({
      success: true,
      data: activities,
      auditLogs,
      stats,
    });
  } catch (error) {
    console.error('List activities error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch activities' },
      { status: 500 }
    );
  }
}
