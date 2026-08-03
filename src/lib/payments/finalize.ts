import prisma from '@/lib/db/prisma';
import { generateReceiptNumber } from '@/lib/utils/format';

/** True when real PalPluss credentials are configured (otherwise we simulate). */
export function isPalplussConfigured(): boolean {
  return !!process.env.PALPLUSS_API_KEY;
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
      unit: true,
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

  const transactionMessage = `PalPluss (M-Pesa) payment of KES ${amount.toLocaleString()} received ${
    invoice ? `for invoice ${invoice.invoiceNumber}` : ''
  }. Receipt ${receiptNumber}. Transaction code ${options.transactionCode}.`;

  const updated = await prisma.$transaction(async (tx) => {
    const paid = await tx.payment.update({
      where: { id: payment.id },
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

    // Attach the transaction message to the Documents section as a RECEIPT document.
    await tx.document.create({
      data: {
        name: `Payment Receipt — ${receiptNumber} (${options.transactionCode})`,
        type: 'RECEIPT',
        url: '#',
        uploadedById: payment.recordedById,
        tenantId: payment.tenantId,
        propertyId: payment.unit?.propertyId ?? payment.tenant?.unit?.propertyId ?? null,
        invoiceId: invoice?.id ?? null,
      },
    });

    // Notify the tenant.
    if (payment.tenant?.userId) {
      await tx.notification.create({
        data: {
          userId: payment.tenant.userId,
          type: 'PAYMENT_RECEIVED',
          title: 'Payment received',
          message: transactionMessage,
        },
      });
    }

    // The landlord is the property owner (the true recipient of rent), falling
    // back to the invoice creator. This matters for tenant-raised invoices where
    // invoice.createdById is the tenant themselves.
    const landlordId = payment.tenant?.unit?.property?.ownerId ?? invoice?.createdById ?? null;
    if (landlordId && landlordId !== payment.tenant?.userId) {
      await tx.notification.create({
        data: {
          userId: landlordId,
          type: 'PAYMENT_RECEIVED',
          title: `Payment from ${payment.tenant?.firstName || 'tenant'}`,
          message: transactionMessage,
        },
      });
    }

    // Send the tenant a message with the transaction details.
    if (payment.tenant?.userId && landlordId) {
      await tx.message.create({
        data: {
          senderId: landlordId,
          receiverId: payment.tenant.userId,
          subject: 'Payment confirmation',
          content: transactionMessage,
        },
      });
    }

    return paid;
  });

  return updated;
}
