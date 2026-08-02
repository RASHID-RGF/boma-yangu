import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { getTenantRecord } from '@/lib/auth/tenant-scope';
import { isManagementRole } from '@/lib/auth/rbac';
import { stkPush, PalPlussApiError } from '@/lib/payments/palpluss';
import { finalizePayment, isPalplussConfigured, simulateTransactionCode } from '@/lib/payments/finalize';
import { z } from 'zod';

const payInvoiceSchema = z.object({
  invoiceId: z.string().min(1, 'Select an invoice'),
  amount: z.number().positive('Amount must be positive').optional(),
  phoneNumber: z.string().optional(),
  method: z.string().optional(),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // TENANT sees only their own payments; management roles see everything.
    const tenantRecord = !isManagementRole(session.role) ? await getTenantRecord(session.userId) : null;

    // A tenant account without a linked Tenant record must never see estate-wide data.
    if (!isManagementRole(session.role) && !tenantRecord) {
      return NextResponse.json({
        success: true,
        data: [],
        stats: { totalPaid: 0, count: 0, pendingCount: 0 },
      });
    }

    const payments = await prisma.payment.findMany({
      where: tenantRecord ? { tenantId: tenantRecord.id } : {},
      orderBy: { paymentDate: 'desc' },
      include: {
        tenant: { select: { firstName: true, lastName: true } },
        unit: { select: { unitNumber: true } },
        invoice: { select: { invoiceNumber: true } },
      },
    });

    // Summary stats for the page header
    const totalPaid = payments
      .filter((p) => p.status === 'COMPLETED' || p.status === 'PARTIAL')
      .reduce((sum, p) => sum + p.amount, 0);
    const pendingCount = payments.filter((p) => p.status === 'PENDING').length;

    return NextResponse.json({
      success: true,
      data: payments,
      stats: { totalPaid, count: payments.length, pendingCount },
    });
  } catch (error) {
    console.error('List payments error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch payments' }, { status: 500 });
  }
}

/**
 * POST /api/payments
 * A tenant pays an invoice (PalPluss STK push when configured, otherwise simulated),
 * or management records a payment directly.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = payInvoiceSchema.parse(body);

    const invoice = await prisma.invoice.findUnique({
      where: { id: validated.invoiceId },
      include: {
        tenant: { include: { user: true } },
        unit: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    const isTenant = !isManagementRole(session.role);

    // Tenants can only pay their own invoices.
    if (isTenant) {
      const tenantRecord = await getTenantRecord(session.userId);
      if (!tenantRecord || tenantRecord.id !== invoice.tenantId) {
        return NextResponse.json(
          { success: false, error: 'You can only pay your own invoices' },
          { status: 403 }
        );
      }
    }

    // Amount defaults to the outstanding balance and is capped at it, so a
    // tenant can never overpay (which would inflate amountPaid past totalAmount).
    const amount = Math.min(validated.amount ?? invoice.balance, invoice.balance);
    if (amount <= 0) {
      return NextResponse.json({ success: false, error: 'This invoice is already fully paid' }, { status: 400 });
    }

    // Create the payment record (PENDING until confirmed).
    // Tenants always pay via M-Pesa — the method is forced so a tenant-supplied
    // value (e.g. 'CASH') can never label a real M-Pesa transaction incorrectly.
    const payment = await prisma.payment.create({
      data: {
        amount,
        status: 'PENDING',
        method: isTenant ? 'MPESA_STK_PUSH' : validated.method || 'MPESA_STK_PUSH',
        description: `Payment for ${invoice.invoiceNumber}`,
        phoneNumber: validated.phoneNumber || invoice.tenant?.phone || null,
        balanceBefore: invoice.balance,
        tenantId: invoice.tenantId,
        unitId: invoice.unitId,
        invoiceId: invoice.id,
        recordedById: session.userId,
      },
    });

    // M-Pesa path: push an STK prompt to the tenant's phone. Tenants always go
    // through PalPluss (which sends an M-Pesa STK prompt) — they can never
    // self-confirm a payment by passing a method.
    if (isTenant) {
      const phone = validated.phoneNumber || invoice.tenant?.phone || '';
      if (isPalplussConfigured()) {
        try {
          const stk = await stkPush(phone, amount, invoice.invoiceNumber, 'Rent payment');
          await prisma.payment.update({
            where: { id: payment.id },
            data: { checkoutRequestId: stk.transactionId },
          });
          return NextResponse.json(
            {
              success: true,
              data: {
                paymentId: payment.id,
                status: 'PENDING',
                message: 'Payment prompt sent. Enter your PIN to complete the payment.',
              },
            },
            { status: 201 }
          );
        } catch (stkError) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'FAILED' },
          });
          if (stkError instanceof PalPlussApiError) {
            console.error('PalPluss STK push error:', stkError.code, stkError.message);
            return NextResponse.json(
              { success: false, error: stkError.message || 'Could not reach the payment provider. Please try again.' },
              { status: stkError.httpStatus }
            );
          }
          console.error('STK push error:', stkError);
          return NextResponse.json(
            { success: false, error: 'Could not reach the payment provider. Please try again.' },
            { status: 502 }
          );
        }
      }

      // Simulation mode (no PalPluss API key): confirm immediately with a
      // simulated transaction code so the full flow works end to end.
      const completed = await finalizePayment(payment.id, {
        transactionCode: simulateTransactionCode(),
        phoneNumber: phone,
      });
      return NextResponse.json(
        {
          success: true,
          data: {
            paymentId: payment.id,
            status: 'COMPLETED',
            transactionCode: completed.transactionCode,
            receiptNumber: completed.receiptNumber,
            message: 'Payment recorded (simulated PalPluss). Receipt generated.',
          },
        },
        { status: 201 }
      );
    }

    // Direct record path: management only (cash / bank transfer / corrections).
    // A tenant can never reach this branch — the M-Pesa path above returns first.
    if (!isManagementRole(session.role)) {
      return NextResponse.json(
        { success: false, error: 'Tenants must pay via M-Pesa' },
        { status: 403 }
      );
    }
    const completed = await finalizePayment(payment.id, {
      transactionCode: `DIR${Date.now().toString(36).toUpperCase()}`,
      phoneNumber: validated.phoneNumber || invoice.tenant?.phone || null,
    });
    return NextResponse.json(
      {
        success: true,
        data: {
          paymentId: payment.id,
          status: 'COMPLETED',
          transactionCode: completed.transactionCode,
          receiptNumber: completed.receiptNumber,
          message: 'Payment recorded successfully.',
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Create payment error:', error);
    return NextResponse.json({ success: false, error: 'Failed to record payment' }, { status: 500 });
  }
}
