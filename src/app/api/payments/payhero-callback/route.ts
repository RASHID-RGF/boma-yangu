import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { finalizePayment } from '@/lib/payments/finalize';
import { parseCallback } from '@/lib/payments/payhero';
import { normalizePhoneForMatch } from '@/lib/payments/phone';

/**
 * Payhero webhook — called after an STK push resolves.
 *
 * Public endpoint (no session): Payhero's servers POST the raw result straight
 * here. The tenant's browser is not involved, so this route must answer on its
 * own.
 *
 * Payhero does not sign its callbacks, so matching is deliberately strict:
 * STK payments must present the `CheckoutRequestID` issued at initiation, which
 * only Payhero and this server ever saw. The looser phone+amount fallback is
 * reserved for hosted-link payments, which have no id to poll.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();

  let callback;
  try {
    callback = parseCallback(body);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { checkoutRequestId, externalReference } = callback;

  // 1) Exact match on the id issued when the STK push was sent. Only PENDING
  //    records qualify, so a late or replayed callback can never resurrect a
  //    payment already marked FAILED/CANCELLED.
  let payment = checkoutRequestId
    ? await prisma.payment.findFirst({
        where: {
          status: 'PENDING',
          OR: [
            { checkoutRequestId },
            { checkoutRequestId: { endsWith: `|${checkoutRequestId}` } },
          ],
        },
      })
    : null;

  // 2) Hosted-link fallback: those records carry no checkoutRequestId (by
  //    design), so match them on the reference we handed Payhero, then on
  //    phone + amount as a last resort.
  if (!payment && !checkoutRequestId) {
    payment = externalReference
      ? await prisma.payment.findFirst({
          where: {
            status: 'PENDING',
            method: 'MPESA_PAY_LINK',
            checkoutRequestId: null,
            invoice: { invoiceNumber: externalReference },
          },
        })
      : null;
  }

  if (!payment && !checkoutRequestId && callback.phone && callback.amount > 0) {
    const phone = normalizePhoneForMatch(callback.phone);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const candidates = await prisma.payment.findMany({
      where: {
        status: 'PENDING',
        method: 'MPESA_PAY_LINK',
        checkoutRequestId: null,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const matches = candidates.filter(
      (p) =>
        p.phoneNumber &&
        normalizePhoneForMatch(p.phoneNumber) === phone &&
        Math.round(p.amount) === Math.round(callback.amount)
    );
    if (matches.length > 1) {
      console.error(
        `Payhero webhook ambiguous match for ${checkoutRequestId ?? externalReference}: ${matches.length} pending payments share phone+amount`
      );
      return NextResponse.json({ error: 'Ambiguous payment' }, { status: 404 });
    }
    payment = matches[0] ?? null;
  }

  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  // Cross-check the amount so a malformed payload can never finalize a payment
  // with a wildly different figure. Hosted links let the tenant edit the amount,
  // so divergence is logged rather than rejected (finalizePayment caps it at the
  // invoice balance).
  if (callback.amount > 0 && callback.amount !== Math.round(payment.amount)) {
    console.warn(
      `Payhero webhook amount for ${payment.id} differs from recorded: recorded ${payment.amount}, callback ${callback.amount}`
    );
  } else if (callback.amount <= 0) {
    console.warn(`Payhero webhook carried no amount for ${payment.id} — using the recorded amount`);
  }

  if (callback.succeeded) {
    await finalizePayment(payment.id, {
      transactionCode: callback.mpesaReceipt || checkoutRequestId || externalReference || 'M-PESA',
      checkoutRequestId: packCheckoutId(payment.checkoutRequestId, checkoutRequestId),
      phoneNumber: callback.phone || payment.phoneNumber,
      amount: callback.amount > 0 ? callback.amount : payment.amount,
    });
  } else if (callback.failed) {
    // Terminal failures only — an unknown/queued outcome must leave the payment
    // PENDING so the status poll can still resolve it.
    await prisma.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  } else {
    console.log(
      `[Payhero] Non-terminal callback for ${payment.id} (status=${callback.rawStatus ?? 'unknown'}) — keeping PENDING`
    );
  }

  return NextResponse.json({ received: true });
}

/**
 * Preserves the packed `reference|CheckoutRequestID` value so the status route
 * can still identify the provider and re-query the transaction later.
 */
function packCheckoutId(existing: string | null, incoming?: string): string | null {
  if (!incoming) return existing;
  if (existing?.includes('|')) {
    const [reference] = existing.split('|');
    return `${reference}|${incoming}`;
  }
  return existing;
}
