import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/jwt';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';
import { isManagementRole } from '@/lib/auth/rbac';
import { syncPendingLinkPayment } from '@/lib/payments/link-sync';

/**
 * GET /api/payments/sync-link
 *
 * Client polling endpoint for hosted pay-link payments. While the tenant is on
 * the PalPluss checkout page, the payments screen calls this every few seconds;
 * it reconciles the tenant's newest open link payment against PalPluss's
 * transaction list (see link-sync.ts) and finalizes it as soon as a matching
 * successful transaction appears.
 *
 * No match / nothing to do is reported as `synced: false` — a normal state
 * while the tenant is still entering their PIN — so the client keeps polling
 * without treating it as an error. Management users get an immediate no-op.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // The endpoint reconciles the CALLER's own link payments. For management
    // users it is a no-op: they never pay via the tenant link flow.
    if (isManagementRole(session.role)) {
      return NextResponse.json({ success: true, synced: false });
    }

    const tenantRecord = await ensureTenantRecord(session.userId);
    if (!tenantRecord) {
      return NextResponse.json({ success: true, synced: false });
    }

    // Newest open link payment for this tenant (checkoutRequestId is null only
    // for link-created records — in-flight STK payments are never touched).
    const payment = await prismaPaymentFindFirst(tenantRecord.id);
    if (!payment) {
      return NextResponse.json({ success: true, synced: false });
    }

    const finalized = await syncPendingLinkPayment(payment.id);
    if (!finalized) {
      return NextResponse.json({ success: true, synced: false });
    }

    return NextResponse.json({
      success: true,
      synced: true,
      data: {
        paymentId: finalized.id,
        status: finalized.status,
        transactionCode: finalized.transactionCode,
        receiptNumber: finalized.receiptNumber,
      },
    });
  } catch (error) {
    console.error('Sync link payment error:', error);
    return NextResponse.json({ success: false, error: 'Failed to sync payment' }, { status: 500 });
  }
}

/** Newest open MPESA_PAY_LINK record for the tenant. */
async function prismaPaymentFindFirst(tenantId: string) {
  const prisma = (await import('@/lib/db/prisma')).default;
  return prisma.payment.findFirst({
    where: {
      tenantId,
      status: 'PENDING',
      method: 'MPESA_PAY_LINK',
      checkoutRequestId: null,
    },
    orderBy: { createdAt: 'desc' },
  });
}
