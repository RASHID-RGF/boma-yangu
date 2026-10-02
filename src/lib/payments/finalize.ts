import prisma from '@/lib/db/prisma';
import { generateReceiptNumber } from '@/lib/utils/format';
import { sendPortalNoticeEmail } from '@/lib/notifications/communication';
import { isDarajaConfigured } from '@/lib/payments/daraja';
import { isPayheroConfigured } from '@/lib/payments/payhero';

/** True when PalPluss credentials are configured (hosted pay-link and STK). */
export function isPalplussConfigured(): boolean {
  return !!(
    process.env.PALPLUSS_API_KEY ||
    process.env['PALPLUSS API KEY'] ||
    process.env.ALPLUSS_API_KEY ||
    process.env['ALPLUSS API KEY']
  );
}

/** The STK push providers this platform can fire. */
export type StkProvider = 'PALPLUSS' | 'PAYHERO' | 'DARAJA';

/**
 * Which provider fires STK pushes in this environment. PalPluss is preferred so
 * the platform uses the active SDK account whenever it is configured; PayHero is
 * next, with Daraja as the final fallback for legacy environments.
 */
export function getStkProvider(): StkProvider {
  if (isPalplussConfigured()) return 'PALPLUSS';
  if (isPayheroConfigured()) return 'PAYHERO';
  return 'DARAJA';
}

/**
 * True when the STK provider is configured. PalPluss is preferred, PayHero is
 * the next active provider, and Daraja remains the fallback. When this is false
 * the payment API refuses the request outright — it never fabricates a completed
 * transaction.
 */
export function isStkProviderConfigured(): boolean {
  return isPalplussConfigured() || isPayheroConfigured() || isDarajaConfigured();
}

/** Generates a realistic-looking transaction code for simulation mode. */
export function simulateTransactionCode(): string {
  return `SIM${Math.floor(10000000 + Math.random() * 89999999)}`;
}

interface FinalizeOptions {
  /** Real M-Pesa receipt number from PalPluss, or a simulated transaction code. */
  transactionCode: string;
  /** Optional PalPluss transaction id for reference. */
  checkoutRequestId?: string | null;
  /** Optional phone number used for the STK push. */
  phoneNumber?: string | null;
  /**
   * Actual amount paid, from the webhook. Used for hosted-link payments where
   * the tenant can edit the amount at checkout; defaults to the recorded
   * payment amount. Capped at the invoice balance so a payment can never
   * inflate amountPaid past totalAmount.
   */
  amount?: number | null;
}

/**
 * Finalizes a PENDING payment as COMPLETED: updates the payment, the linked
 * invoice (amountPaid/balance/status), creates a RECEIPT document containing
 * the transaction message, notifies both tenant and landlord, and sends the
 * tenant a message with the transaction details.
 */
export async function finalizePayment(paymentId: string, options: FinalizeOptions) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      invoice: true,
      tenant: { include: { user: true, unit: { include: { property: true } } } },
      unit: { include: { property: true } },
    },
  });

  if (!payment) throw new Error('Payment not found');
  if (payment.status === 'COMPLETED') return payment;

  const invoice = payment.invoice;
  // Actual paid amount (may differ from the record for hosted-link payments).
  const amount =
    options.amount != null
      ? Math.min(options.amount, invoice ? invoice.balance : options.amount)
      : payment.amount;
  const newPaid = (invoice?.amountPaid || 0) + amount;
  const newBalance = invoice ? Math.max(0, invoice.totalAmount - newPaid) : 0;
  const isPartial = invoice ? newBalance > 0 : false;

  const receiptNumber = generateReceiptNumber();
  const now = new Date();

  const transactionMessage = `M-Pesa payment of KES ${amount.toLocaleString()} received ${
    invoice ? `for invoice ${invoice.invoiceNumber}` : ''
  }. Receipt ${receiptNumber}. Transaction code ${options.transactionCode}.`;

  // Interactive transaction with remote PostgreSQL — each query pays
  // round-trip latency, so the default 5s timeout can expire mid-transaction and
  // abort a real payment. 15s covers ~9 sequential round-trips with headroom.
  const updated = await prisma.$transaction(
    async (tx) => {
    // Atomically claim the PENDING payment so concurrent finalizations (the
    // PalPluss webhook racing the status-endpoint provider poll) can never
    // double-apply to the payment and its invoice.
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: {
        status: 'COMPLETED',
        amount,
        transactionCode: options.transactionCode,
        receiptNumber,
        checkoutRequestId: options.checkoutRequestId ?? payment.checkoutRequestId,
        phoneNumber: options.phoneNumber ?? payment.phoneNumber,
        recordedAt: now,
        paymentDate: now,
        isPartial,
        balanceBefore: invoice ? invoice.balance : null,
        balanceAfter: invoice ? newBalance : null,
      },
    });
    if (claimed.count === 0) {
      // Already finalized (or no longer PENDING) elsewhere — leave the record
      // and the invoice untouched.
      return payment;
    }

    const paid = await tx.payment.findUnique({ where: { id: payment.id } });
    if (!paid) throw new Error('Payment disappeared during finalization');

    if (invoice) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: newPaid,
          balance: newBalance,
          status: newBalance <= 0 ? 'PAID' : invoice.status === 'DRAFT' ? 'SENT' : invoice.status,
        },
      });
    }

    // Money state only. Receipts, notifications and emails are deliberately
    // NOT part of this transaction — see below.
    return paid;
    },
    { timeout: 15_000 }
  );

  // Lost the claim race: another finalizer (webhook vs. provider poll) already
  // completed this payment and owns the side effects.
  if (updated.status !== 'COMPLETED') return updated;

  // A payment the tenant has already made must never be lost to a cosmetic
  // failure. Everything below runs AFTER the commit and is best-effort: a
  // failed INSERT, a slow SMTP call or a down notification service logs a
  // warning and leaves the payment COMPLETED. Previously all of it ran inside
  // the transaction, so any failure (e.g. a missing `Document.attachmentId`
  // column) rolled the status flip back to PENDING — the tenant was debited by
  // M-Pesa while the app kept counting down and showed "pending".
  const runSideEffect = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (error) {
      console.error(
        `[Payment] ${label} failed for payment ${payment.id} — payment is still COMPLETED:`,
        error instanceof Error ? error.message : error
      );
    }
  };

  // Receipt document in the Documents section.
  await runSideEffect('receipt document', () =>
    prisma.document.create({
      data: {
        name: `Payment Receipt — ${receiptNumber} (${options.transactionCode})`,
        type: 'RECEIPT',
        url: '#',
        uploadedById: payment.recordedById,
        tenantId: payment.tenantId,
        propertyId: payment.unit?.propertyId ?? payment.tenant?.unit?.propertyId ?? null,
        invoiceId: invoice?.id ?? null,
      },
    })
  );

  // Notify the tenant (in-app + email) — each on its own so one can't block
  // the other.
  const tenantUserId = payment.tenant?.userId ?? null;
  if (tenantUserId) {
    await runSideEffect('tenant notification', () =>
      prisma.notification.create({
        data: {
          userId: tenantUserId,
          type: 'PAYMENT_RECEIVED',
          title: 'Payment received',
          message: transactionMessage,
        },
      })
    );
    await runSideEffect('tenant email', async () => {
      const tenantUser = await prisma.user.findUnique({
        where: { id: tenantUserId },
        select: { email: true, firstName: true, lastName: true },
      });
      if (tenantUser?.email) {
        await sendPortalNoticeEmail({
          to: tenantUser.email,
          recipientName: `${tenantUser.firstName} ${tenantUser.lastName}`.trim() || tenantUser.email,
          subject: 'Payment received',
          content: transactionMessage,
          category: 'Payment',
        });
      }
    });
  }

  // The landlord is the property owner (the true recipient of rent), falling
  // back to the invoice creator. This matters for tenant-raised invoices where
  // invoice.createdById is the tenant themselves.
  const landlordId = payment.tenant?.unit?.property?.ownerId ?? invoice?.createdById ?? null;
  if (landlordId && landlordId !== payment.tenant?.userId) {
    await runSideEffect('landlord notification', () =>
      prisma.notification.create({
        data: {
          userId: landlordId,
          type: 'PAYMENT_RECEIVED',
          title: `Payment from ${payment.tenant?.firstName || 'tenant'}`,
          message: transactionMessage,
        },
      })
    );
    await runSideEffect('landlord email', async () => {
      const landlord = await prisma.user.findUnique({
        where: { id: landlordId! },
        select: { email: true, firstName: true, lastName: true },
      });
      if (landlord?.email) {
        await sendPortalNoticeEmail({
          to: landlord.email,
          recipientName: `${landlord.firstName} ${landlord.lastName}`.trim() || landlord.email,
          subject: `Payment from ${payment.tenant?.firstName || 'tenant'}`,
          content: transactionMessage,
          category: 'Payment',
        });
      }
    });
  }

  // Send the tenant a message with the transaction details.
  if (payment.tenant?.userId && landlordId) {
    await runSideEffect('tenant message', () =>
      prisma.message.create({
        data: {
          senderId: landlordId,
          receiverId: payment.tenant!.userId,
          subject: 'Payment confirmation',
          content: transactionMessage,
        },
      })
    );
  }

  // Activity feed entry so every payment is reflected in the estate log
  // (dashboard activity, admin views) with the property it belongs to.
  await runSideEffect('activity log', () =>
    prisma.activityLog.create({
      data: {
        action: 'PAYMENT_RECORDED',
        description: transactionMessage,
        entityType: 'PAYMENT',
        entityId: payment.id,
        userId: payment.recordedById,
        propertyId: payment.unit?.propertyId ?? payment.tenant?.unit?.propertyId ?? null,
      },
    })
  );

  return updated;
}
