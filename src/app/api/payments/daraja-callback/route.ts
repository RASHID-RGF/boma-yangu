import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { finalizePayment } from '@/lib/payments/finalize';

/**
 * POST /api/payments/daraja-callback
 *
 * Safaricom Daraja calls this URL after the tenant completes (or cancels) an
 * STK push. The body contains the STK result under `Body.stkCallback`.
 *
 * We match the CheckoutRequestID to the PENDING payment record and finalize it
 * as COMPLETED (success) or FAILED (cancelled / timeout).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('[Daraja Callback] Received:', JSON.stringify(body).slice(0, 500));

    // Daraja wraps the result in Body.stkCallback
    const callback = body?.Body?.stkCallback;
    if (!callback) {
      console.warn('[Daraja Callback] Missing stkCallback in body');
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'OK' });
    }

    const checkoutRequestId = callback.CheckoutRequestID;
    const resultCode = callback.ResultCode;
    const resultDesc = callback.ResultDesc || '';

    if (!checkoutRequestId) {
      console.warn('[Daraja Callback] Missing CheckoutRequestID');
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'OK' });
    }

    // Find the PENDING payment that matches this checkout request.
    const payment = await prisma.payment.findFirst({
      where: {
        checkoutRequestId,
        status: 'PENDING',
      },
      include: {
        invoice: true,
        tenant: { include: { user: true, unit: { include: { property: true } } } },
        unit: { include: { property: true } },
      },
    });

    if (!payment) {
      console.warn('[Daraja Callback] No pending payment found for checkout:', checkoutRequestId);
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'OK' });
    }

    // ResultCode 0 = success; anything else = cancelled / timeout / error.
    if (resultCode === 0) {
      // Extract the actual amount paid from callback metadata (Safaricom
      // sends Amount, MpesaReceiptNumber, etc. in CallbackMetadata).
      const metadata = callback.CallbackMetadata?.Item || [];
      const amountPaid = metadata.find((m: any) => m.Name === 'Amount')?.Value;
      const mpesaReceipt = metadata.find((m: any) => m.Name === 'MpesaReceiptNumber')?.Value;
      const phoneUsed = metadata.find((m: any) => m.Name === 'PhoneNumber')?.Value;

      console.log('[Daraja Callback] Success — receipt:', mpesaReceipt, 'amount:', amountPaid);

      await finalizePayment(payment.id, {
        transactionCode: mpesaReceipt || checkoutRequestId,
        checkoutRequestId,
        phoneNumber: phoneUsed ? String(phoneUsed) : payment.phoneNumber,
        amount: amountPaid != null ? Number(amountPaid) : undefined,
      });

      console.log('[Daraja Callback] Payment finalized:', payment.id);
    } else {
      // Payment failed or was cancelled by the user.
      console.warn('[Daraja Callback] Payment failed — code:', resultCode, 'desc:', resultDesc);
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      // Notify the tenant that their payment failed.
      if (payment.tenant?.userId) {
        await prisma.notification.create({
          data: {
            userId: payment.tenant.userId,
            type: 'PAYMENT_RECEIVED',
            title: 'Payment failed',
            message: `Your M-Pesa payment of KES ${payment.amount.toLocaleString()} could not be completed. ${resultDesc || 'Please try again.'}`,
          },
        });
      }
    }

    // Daraja expects a 200 with ResultCode 0 to acknowledge receipt.
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'OK' });
  } catch (error) {
    console.error('[Daraja Callback] Error:', error);
    // Always return 200 to Daraja so it doesn't retry.
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'OK' });
  }
}
