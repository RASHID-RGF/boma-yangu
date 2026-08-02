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
  // the payload shape. Verifying a webhook signature is a future hardening step.
  const { event_type, transaction } = payload;

  // Find the matching payment by the PalPluss transaction id (stored in
  // checkoutRequestId at initiation), falling back to the invoice number.
  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        { checkoutRequestId: transaction.id },
        ...(transaction.external_reference
          ? [{ invoice: { invoiceNumber: transaction.external_reference } }]
          : []),
      ],
    },
  });

  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  // Cross-check the webhook amount against the payment so a malformed payload
  // can never finalize a payment with the wrong amount. The STK push wrapper
  // rounds amounts, so compare against the rounded payment amount.
  if (Number(transaction.amount) !== Math.round(payment.amount)) {
    console.error(
      `PalPluss webhook amount mismatch for ${payment.id}: expected ${Math.round(payment.amount)}, got ${transaction.amount}`
    );
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
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
