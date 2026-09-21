import prisma from '@/lib/db/prisma';
import { isPalplussConfigured } from '@/lib/payments/finalize';
import { listRecentTransactions } from '@/lib/payments/palpluss';
import { normalizePhoneForMatch } from '@/lib/payments/phone';

/**
 * Shared reconciliation for hosted pay-link payments (MPESA_PAY_LINK,
 * checkoutRequestId null). Link checkouts are created on PalPluss's side —
 * outside this API — so the app has no transaction id to poll; confirmation
 * normally arrives via the webhook. When the webhook cannot reach the server
 * (local dev, transient network errors), this helper bridges the gap: it
 * searches PalPluss's recent transactions for a successful phone+amount match
 * and finalizes the payment record.
 *
 * Matching is deliberately strict:
 * - the PalPluss transaction must be a SUCCESS within the last 24h,
 * - phone (normalized) AND amount must both match,
 * - the transaction is claimed atomically by storing its id in
 *   checkoutRequestId, so a racing webhook/sync can never double-claim
 *   (finalizePayment additionally no-ops on non-PENDING records).
 *
 * Returns the finalized payment, or null when nothing matched yet (not an
 * error — the client keeps polling).
 */
export async function syncPendingLinkPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return null;
  if (payment.status !== 'PENDING' || payment.method !== 'MPESA_PAY_LINK' || payment.checkoutRequestId) {
    // Not an open link payment — nothing to reconcile.
    return null;
  }
  if (!isPalplussConfigured()) return null;

  const phone = normalizePhoneForMatch(payment.phoneNumber);
  if (!phone) return null;

  const transactions = await listRecentTransactions(50).catch((error) => {
    console.warn('[Link Sync] PalPluss list failed (will retry):', error instanceof Error ? error.message : error);
    return null;
  });
  if (!transactions) return null;

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const match = transactions.find(
    (tx) =>
      tx.status === 'SUCCESS' &&
      normalizePhoneForMatch(tx.phone_number) === phone &&
      Math.round(tx.amount) === Math.round(payment.amount) &&
      new Date(tx.updated_at || tx.created_at).getTime() >= since
  );
  if (!match) return null;

  // Claim the transaction atomically before finalizing.
  const claimed = await prisma.payment.updateMany({
    where: { id: payment.id, status: 'PENDING', checkoutRequestId: null },
    data: { checkoutRequestId: match.transaction_id },
  });
  if (claimed.count === 0) return null;

  // The list API carries no M-Pesa receipt (webhook payloads only), so the
  // PalPluss transaction id is the transaction code — same convention as the
  // status-route webhook fallback.
  const { finalizePayment } = await import('@/lib/payments/finalize');
  const finalized = await finalizePayment(payment.id, {
    transactionCode: match.transaction_id,
    checkoutRequestId: match.transaction_id,
    phoneNumber: match.phone_number || payment.phoneNumber,
    amount: match.amount,
  });
  return finalized;
}
