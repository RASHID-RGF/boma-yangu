import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';
import { isManagementRole } from '@/lib/auth/rbac';
import { finalizePayment } from '@/lib/payments/finalize';
import { queryStatus as palplussQueryStatus } from '@/lib/payments/palpluss';

/**
 * GET /api/payments/[id]/status?wait=55000
 *
 * Long-poll endpoint for the "waiting for M-Pesa PIN" flow. After an STK push,
 * the tenant's screen holds a live waiting state while the tenant enters their
 * PIN on their phone. The provider callback (PalPluss webhook)
 * finalizes the payment asynchronously — this route polls the payment record
 * server-side and only responds once the payment leaves PENDING (COMPLETED /
 * FAILED / CANCELLED) or the wait window (max 1 minute) elapses, so the client
 * doesn't have to hammer the API with rapid refreshes.
 *
 * The client chains requests until its own 60s deadline; if the hosting
 * platform cuts the request early the client simply retries.
 *
 * Webhook fallback: the PalPluss webhook can fail to reach the server (local
 * dev without a public URL, transient network errors). While waiting, this
 * route therefore also asks PalPluss directly for the STK outcome every ~9s
 * and finalizes the payment from the provider's answer — so the payment flow
 * always completes, with or without callback delivery.
 */
export const dynamic = 'force-dynamic';

const MAX_WAIT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;
const PROVIDER_QUERY_INTERVAL_MS = 9_000;
const LINK_SYNC_INTERVAL_MS = 12_000;
const FAILED_STATUSES = new Set(['FAILED', 'CANCELLED', 'EXPIRED', 'REVERSED']);

const STATUS_SELECT = {
  id: true,
  status: true,
  transactionCode: true,
  receiptNumber: true,
  checkoutRequestId: true,
  method: true,
  tenantId: true,
  tenant: { select: { userId: true } },
  unit: { select: { property: { select: { ownerId: true } } } },
} as const;

/**
 * Webhook fallback: ask PalPluss directly for the STK outcome and finalize the
 * payment from the provider's answer. Only terminal statuses are acted on —
 * PENDING/PROCESSING responses simply keep the wait going.
 */
async function syncFromProvider(paymentId: string, checkoutRequestId: string) {
  let tx;
  try {
    tx = await palplussQueryStatus(checkoutRequestId);
  } catch (error) {
    // In-progress or transient query errors — keep waiting; the webhook (or a
    // later poll) still finalizes the payment.
    console.warn('[Payment Status] PalPluss query failed (will retry):', error instanceof Error ? error.message : error);
    return;
  }
  if (!tx) return;

  if (tx.status === 'SUCCESS') {
    // The webhook normally lands first with the real M-Pesa receipt; this is
    // the fallback, so the PalPluss transaction id is a safe code.
    await finalizePayment(paymentId, {
      transactionCode: tx.transaction_id,
      checkoutRequestId: tx.transaction_id,
      phoneNumber: tx.phone_number,
      amount: tx.amount,
    });
    return;
  }

  if (FAILED_STATUSES.has(tx.status)) {
    // Atomically mark FAILED so a racing webhook can't double-handle it.
    const failed = await prisma.payment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    if (failed.count > 0) {
      // Notify the tenant that their payment failed.
      const fresh = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { amount: true, tenant: { select: { userId: true } } },
      });
      if (fresh?.tenant?.userId) {
        await prisma.notification.create({
          data: {
            userId: fresh.tenant.userId,
            type: 'PAYMENT_RECEIVED',
            title: 'Payment failed',
            message: `Your M-Pesa payment of KES ${fresh.amount.toLocaleString()} could not be completed. ${tx.result_desc || 'Please try again.'}`,
          },
        });
      }
    }
  }
}

/**
 * Webhook fallback for hosted pay-link payments: link checkouts are created on
 * PalPluss's side, so there is no transaction id to poll — ask the shared
 * reconciliation logic instead, which searches PalPluss's recent transactions
 * for a successful phone+amount match and finalizes the payment.
 */
async function syncLinkFromProvider(paymentId: string) {
  try {
    const { syncPendingLinkPayment } = await import('@/lib/payments/link-sync');
    return await syncPendingLinkPayment(paymentId);
  } catch (error) {
    // In-progress or transient errors — keep waiting; the webhook (or a later
    // poll) still finalizes the payment.
    console.warn('[Payment Status] Link sync failed (will retry):', error instanceof Error ? error.message : error);
    return false;
  }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      select: STATUS_SELECT,
    });
    if (!payment) {
      return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 });
    }

    // Same scoping rules as GET /api/payments: tenants only see their own
    // payments; management only sees payments on their own properties.
    if (isManagementRole(session.role)) {
      if (session.role !== 'SUPER_ADMIN' && payment.unit?.property?.ownerId !== session.userId) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
    } else {
      const tenantRecord = await ensureTenantRecord(session.userId);
      if (!tenantRecord || tenantRecord.id !== payment.tenantId) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    // Wait budget: capped at 1 minute. The client passes `wait` so each request
    // stays under common 60s proxy timeouts.
    const url = new URL(request.url);
    const waitParam = Number(url.searchParams.get('wait'));
    const waitMs = Math.max(
      0,
      Math.min(Number.isFinite(waitParam) ? waitParam : MAX_WAIT_MS, MAX_WAIT_MS)
    );

    // Long-poll: hold the request open until the tenant's PIN entry finalizes
    // the payment via the provider callback, or the window elapses. Early exit
    // when the client disconnects (`request.signal`). While waiting, the
    // provider itself is polled as a webhook fallback so the wait always ends
    // in a terminal status.
    const deadline = Date.now() + waitMs;
    let current = payment;
    let nextProviderCheckAt = Date.now();
    let nextLinkSyncAt = Date.now();
    while (current.status === 'PENDING' && Date.now() < deadline && !request.signal.aborted) {
      const sleepMs = Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now()));
      if (sleepMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
      }
      current =
        (await prisma.payment.findUnique({
          where: { id: payment.id },
          select: STATUS_SELECT,
        })) ?? current;

      if (
        current.status === 'PENDING' &&
        current.method === 'MPESA_PAY_LINK' &&
        !current.checkoutRequestId &&
        Date.now() >= nextLinkSyncAt
      ) {
        // Hosted pay-link payment: reconcile against PalPluss's transaction
        // list (no checkoutRequestId exists to poll for these).
        nextLinkSyncAt = Date.now() + LINK_SYNC_INTERVAL_MS;
        await syncLinkFromProvider(current.id);
        current =
          (await prisma.payment.findUnique({
            where: { id: payment.id },
            select: STATUS_SELECT,
          })) ?? current;
      } else if (current.status === 'PENDING' && current.checkoutRequestId && Date.now() >= nextProviderCheckAt) {
        nextProviderCheckAt = Date.now() + PROVIDER_QUERY_INTERVAL_MS;
        await syncFromProvider(current.id, current.checkoutRequestId);
        current =
          (await prisma.payment.findUnique({
            where: { id: payment.id },
            select: STATUS_SELECT,
          })) ?? current;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        paymentId: current.id,
        status: current.status,
        transactionCode: current.transactionCode,
        receiptNumber: current.receiptNumber,
      },
    });
  } catch (error) {
    console.error('Payment status poll error:', error);
    return NextResponse.json({ success: false, error: 'Failed to check payment status' }, { status: 500 });
  }
}
