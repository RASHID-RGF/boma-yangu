import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { finalizePayment } from '@/lib/payments/finalize';
import { parseWebhookPayload } from '@palpluss/sdk';

/**
 * PalPluss webhook — called after an STK push completes. This is a public
 * endpoint (no session) — PalPluss's servers hit it directly with a raw JSON
 * body, which `parseWebhookPayload` validates and shapes.
 */
export async function POST(req: NextRequest) {
  // Read the raw body — parseWebhookPayload expects the raw JSON string.
  const body = await req.text();

  let payload;
  try {
    payload = parseWebhookPayload(body);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // NOTE: PalPluss does not sign webhooks; parseWebhookPayload validates only
  // the payload shape. The phone+amount fallback below can be spoofed by anyone
  // who knows a tenant's phone and invoice balance — verify webhook signatures
  // (or add an HMAC) before going to production.
  const { event_type, transaction } = payload;

  // Find the matching payment by the PalPluss transaction id (stored in
  // checkoutRequestId at initiation), falling back to the invoice number.
  // Only PENDING records are matched so a late success webhook can never
  // re-activate a payment already marked FAILED or CANCELLED.
  let payment = await prisma.payment.findFirst({
    where: {
      status: 'PENDING',
      OR: [
        { checkoutRequestId: transaction.id },
        ...(transaction.external_reference
          ? [{ invoice: { invoiceNumber: transaction.external_reference } }]
          : []),
      ],
    },
  });

  // Hosted-link fallback: no checkoutRequestId/external_reference is set for a
  // pay-link checkout, so match a recent PENDING payment by phone + amount.
  // Requires a UNIQUE match — if several records could fit, treat it as
  // ambiguous rather than finalizing an arbitrary one.
  if (!payment && transaction.phone_number && transaction.amount > 0) {
    const norm = (p: string) => p.replace(/^0+/, '254').replace(/^\+/, '');
    const phone = norm(transaction.phone_number);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    // checkoutRequestId is null only for link-created records — STK payments
    // always have it set right after the push — so this can never finalize an
    // in-flight STK payment.
    const candidates = await prisma.payment.findMany({
      where: { status: 'PENDING', checkoutRequestId: null, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const matches = candidates.filter(
      (p) => p.phoneNumber && norm(p.phoneNumber) === phone && Math.round(p.amount) === Math.round(Number(transaction.amount))
    );
    if (matches.length > 1) {
      console.error(
        `PalPluss webhook ambiguous match for ${transaction.id}: ${matches.length} pending payments share phone+amount`
      );
      return NextResponse.json({ error: 'Ambiguous payment' }, { status: 404 });
    }
    payment = matches[0] ?? null;
  }

  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  // Cross-check the webhook amount so a malformed payload can never finalize a
  // payment with a wildly different amount. The hosted link lets tenants edit
  // the amount, so accept it and record the actual amount paid (finalizePayment
  // caps it at the invoice balance) — but log the divergence for reconciliation.
  if (Number(transaction.amount) <= 0) {
    console.error(`PalPluss webhook invalid amount for ${payment.id}: ${transaction.amount}`);
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }
  if (Number(transaction.amount) !== Math.round(payment.amount)) {
    console.warn(
      `PalPluss webhook amount for ${payment.id} differs from recorded: recorded ${payment.amount}, webhook ${transaction.amount}`
    );
  }

  const succeeded =
    event_type === 'transaction.success' ||
    (event_type === 'transaction.updated' && transaction.status === 'SUCCESS');

  const failed = ['FAILED', 'CANCELLED', 'EXPIRED', 'REVERSED'].includes(transaction.status) ||
    ['transaction.failed', 'transaction.cancelled', 'transaction.expired'].includes(event_type);

  if (succeeded) {
    await finalizePayment(payment.id, {
      transactionCode: transaction.mpesa_receipt || transaction.id,
      checkoutRequestId: transaction.id,
      phoneNumber: transaction.phone_number || payment.phoneNumber,
      amount: Number(transaction.amount),
    });
  } else if (failed) {
    // Terminal failure states only — a PENDING/PROCESSING 'updated' event must
    // never mark an in-flight payment as failed.
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    });
  }

  // Intermediate 'updated' events are acknowledged but leave the payment PENDING.
  return NextResponse.json({ received: true });
}
