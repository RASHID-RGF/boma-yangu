import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { isManagementRole, MANAGEMENT_ROLES } from '@/lib/auth/rbac';
import { logActivity, extractIpAddress } from '@/lib/db/activity-logger';
import { sendPortalNoticeEmail } from '@/lib/notifications/communication';
import { z } from 'zod';

const updateMaintenanceSchema = z.object({
  status: z.enum(['REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  assignedToId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * PATCH /api/maintenance/[id]
 * Management updates the status of a maintenance request (and optionally
 * assigns it to a caretaker). The tenant is notified of every status change.
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
    const validated = updateMaintenanceSchema.parse(body);

    const existing = await prisma.maintenanceRequest.findUnique({
      where: { id: params.id },
      include: { tenant: { include: { user: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    }

    // If assigning to someone, make sure they exist and are estate staff.
    if (validated.assignedToId) {
      const assignee = await prisma.user.findUnique({ where: { id: validated.assignedToId } });
      if (!assignee || !(MANAGEMENT_ROLES as string[]).includes(assignee.role)) {
        return NextResponse.json(
          { success: false, error: 'Assignee must be an estate staff member' },
          { status: 400 }
        );
      }
    }

    const data: {
      status?: string;
      assignedToId?: string | null;
      notes?: string | null;
      completedDate?: Date | null;
    } = {};

    if (validated.status && validated.status !== existing.status) {
      data.status = validated.status;
      data.completedDate = validated.status === 'COMPLETED' ? new Date() : null;
    }
    if (validated.assignedToId !== undefined && validated.assignedToId !== existing.assignedToId) {
      data.assignedToId = validated.assignedToId || null;
    }
    if (validated.notes !== undefined && validated.notes !== existing.notes) {
      data.notes = validated.notes || null;
    }

    const updated = await prisma.maintenanceRequest.update({
      where: { id: params.id },
      data,
      include: {
        tenant: { select: { firstName: true, lastName: true } },
        unit: { select: { unitNumber: true } },
        assignedTo: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    // Notify the tenant about the status change (in-app + email).
    try {
      if (existing.tenant?.userId && data.status) {
        const labels: Record<string, string> = {
          REPORTED: 'reported',
          ASSIGNED: 'assigned to a technician',
          IN_PROGRESS: 'in progress',
          COMPLETED: 'completed',
          CANCELLED: 'cancelled',
        };
        const statusLabel = labels[data.status] || data.status.toLowerCase();
        await prisma.notification.create({
          data: {
            userId: existing.tenant.userId,
            type: 'MAINTENANCE_UPDATE',
            title: `Maintenance update: ${existing.title}`,
            message: `Your maintenance request "${existing.title}" is now ${statusLabel}.`,
          },
        });

        // Email the tenant so they see the update outside the dashboard.
        const tenantUser = await prisma.user.findUnique({
          where: { id: existing.tenant.userId },
          select: { email: true, firstName: true, lastName: true },
        });
        if (tenantUser?.email) {
          await sendPortalNoticeEmail({
            to: tenantUser.email,
            recipientName: `${tenantUser.firstName} ${tenantUser.lastName}`.trim() || tenantUser.email,
            subject: `Maintenance update: ${existing.title}`,
            content: `Your maintenance request "${existing.title}" is now ${statusLabel}.${validated.notes ? ` Notes: ${validated.notes}` : ''}`,
            category: 'Maintenance',
          });
        }
      }
    } catch (notifyError) {
      console.error('Maintenance update notification error:', notifyError);
    }

    // Log the maintenance status change
    logActivity({
      action: `MAINTENANCE_${data.status || 'UPDATED'}`,
      description: `Maintenance "${existing.title}" ${data.status ? `status changed to ${data.status}` : 'updated'}`,
      entityType: 'MAINTENANCE',
      entityId: params.id,
      userId: session.userId,
      maintenanceId: params.id,
      ipAddress: extractIpAddress(request),
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Update maintenance error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update request' }, { status: 500 });
  }
}
