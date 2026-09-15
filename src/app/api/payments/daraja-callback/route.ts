import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { finalizePayment } from '@/lib/payments/finalize';

function normalizePhoneNumber(phone: string): string {
  const digits = phone.trim().replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  return `254${digits}`;
}

function getCallbackItem(items: Array<{ Name: string; Value: string | number }>, name: string) {
  return items.find((item) => item.Name === name)?.Value;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.Body?.stkCallback) {
    return NextResponse.json({ error: 'Invalid callback payload' }, { status: 400 });
  }

  const callback = body.Body.stkCallback;
  const checkoutRequestId = callback.CheckoutRequestID as string | undefined;
  const resultCode = Number(callback.ResultCode ?? -1);
  const callbackItems = Array.isArray(callback.CallbackMetadata?.Item) ? callback.CallbackMetadata.Item : [];
  const phoneNumber = getCallbackItem(callbackItems, 'PhoneNumber') as string | undefined;
  const amount = Number(getCallbackItem(callbackItems, 'Amount') ?? 0);
  const receiptCode = (getCallbackItem(callbackItems, 'MpesaReceiptNumber') as string | undefined) || callback.CheckoutRequestID;

  if (!checkoutRequestId) {
    return NextResponse.json({ error: 'Missing checkout request id' }, { status: 400 });
  }

  let payment = await prisma.payment.findFirst({
    where: {
      status: 'PENDING',
      checkoutRequestId,
    },
  });

  if (!payment && phoneNumber && amount > 0) {
    const phone = normalizePhoneNumber(String(phoneNumber));
    const candidates = await prisma.payment.findMany({
      where: {
        status: 'PENDING',
        checkoutRequestId: null,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const matches = candidates.filter((candidate) => {
      const candidatePhone = candidate.phoneNumber ? normalizePhoneNumber(candidate.phoneNumber) : '';
      return candidatePhone === phone && Math.round(candidate.amount) === Math.round(amount);
    });

    payment = matches[0] ?? null;
  }

  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  if (resultCode === 0) {
    await finalizePayment(payment.id, {
      transactionCode: receiptCode,
      checkoutRequestId,
      phoneNumber: phoneNumber ? normalizePhoneNumber(String(phoneNumber)) : payment.phoneNumber,
      amount,
    });
  } else {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    });
  }

  return NextResponse.json({ received: true });
}
