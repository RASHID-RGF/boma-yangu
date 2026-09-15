import prisma from './prisma';

/**
 * Logs a user activity to the activityLog table.
 * Every action in the system should go through this function so there
 * is a complete audit trail in the database.
 */
export async function logActivity(params: {
  action: string;
  description: string;
  entityType: string;
  entityId?: string | null;
  userId: string;
  propertyId?: string | null;
  maintenanceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        action: params.action,
        description: params.description,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        userId: params.userId,
        propertyId: params.propertyId ?? null,
        maintenanceId: params.maintenanceId ?? null,
        metadata: params.metadata ?? null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (error) {
    // Activity logging is non-critical — never let it break the main flow.
    console.error('Failed to log activity:', error);
  }
}

/**
 * Logs a detailed audit entry (before/after values) for sensitive changes
 * like role changes, deletions, and financial adjustments.
 */
export async function logAudit(params: {
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        userId: params.userId,
        oldValue: params.oldValue ?? null,
        newValue: params.newValue ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (error) {
    console.error('Failed to log audit:', error);
  }
}

/** Extract IP address from request headers. */
export function extractIpAddress(request: Request): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  );
}

/** Extract user agent from request headers. */
export function extractUserAgent(request: Request): string | null {
  return request.headers.get('user-agent') || null;
}
