import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';
import { isManagementRole } from '@/lib/auth/rbac';
import { stkPush, PalPlussApiError } from '@/lib/payments/palpluss';
import { finalizePayment, isPalplussConfigured, simulateTransactionCode } from '@/lib/payments/finalize';
import { z } from 'zod';

/**
 * A payment can be made against an invoice (invoiceId) OR as a direct/standalone
 * rent payment (no invoice). Direct payments are recorded against the tenant's
 * unit and finalize just like invoice payments — the invoice section is never
 * required for the payment to go through.
 */
const createPaymentSchema = z.object({
  // Invoice-linked payment (optional — direct payments have no invoice).
  invoiceId: z.string().min(1, 'Select an invoice').optional(),
  // Amount for the payment. Defaults to the invoice balance for invoice-linked
  // payments; REQUIRED for direct payments.
  amount: z.number().positive('Amount must be positive').optional(),
  phoneNumber: z.string().optional(),
  // Management direct-record only: which tenant and how they paid.
  tenantId: z.string().optional(),
  method: z
    .enum(['MPESA_STK_PUSH', 'MPESA_PAYBILL', 'MPESA_TILL_NUMBER', 'BANK_TRANSFER', 'CASH'])
    .optional(),
  // Hosted-link payments: create the PENDING record now; the PalPluss webhook
  // finalizes it when the tenant completes the hosted checkout.
  payViaLink: z.boolean().optional(),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // TENANT sees only their own payments; management roles see everything.
    // Self-registered tenant accounts get a Tenant profile auto-created here so
    // they are never stuck with a dead-end "no linked tenant" error.
    const tenantRecord = !isManagementRole(session.role) ? await ensureTenantRecord(session.userId) : null;

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
 * - A tenant pays an invoice or makes a direct rent payment (PalPluss STK push
 *   when configured, otherwise simulated).
 * - Management records a payment directly (cash / bank transfer / M-Pesa).
 * The invoice section is never required: direct payments work end to end.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createPaymentSchema.parse(body);

    const isTenant = !isManagementRole(session.role);

    // ---------- Resolve the payment's tenant / unit / invoice ----------
    let invoice: any = null;
    let tenantId: string;
    // Nullable: a self-registered tenant may not have a unit assigned yet, and
    // can still make a direct rent payment (management assigns the unit later).
    let unitId: string | null = null;
    // Fallback M-Pesa number for link payments that didn't supply one (the
    // webhook matches by phone+amount, so a record without a phone can never
    // be finalized).
    let tenantRecordPhone: string | null = null;

    if (validated.invoiceId) {
      // Invoice-linked payment.
      invoice = await prisma.invoice.findUnique({
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

      // Tenants can only pay their own invoices. Self-heal missing profiles so
      // self-registered tenants can pay immediately.
      if (isTenant) {
        const tenantRecord = await ensureTenantRecord(session.userId);
        if (!tenantRecord || tenantRecord.id !== invoice.tenantId) {
          return NextResponse.json(
            { success: false, error: 'You can only pay your own invoices' },
            { status: 403 }
          );
        }
        tenantRecordPhone = tenantRecord.phone || null;
      }

      tenantId = invoice.tenantId;
      unitId = invoice.unitId;
    } else {
      // Direct / standalone payment — no invoice involved.
      if (!validated.amount || validated.amount <= 0) {
        return NextResponse.json({ success: false, error: 'Enter the amount to pay' }, { status: 400 });
      }

      if (isTenant) {
        // Self-heal: self-registered tenants get their Tenant profile created
        // here on the fly, so paying never fails with "no linked tenant".
        const tenantRecord = await ensureTenantRecord(session.userId);
        if (!tenantRecord) {
          return NextResponse.json(
            { success: false, error: 'No tenant profile linked to this account. Contact management.' },
            { status: 400 }
          );
        }
        tenantRecordPhone = tenantRecord.phone || null;
        tenantId = tenantRecord.id;
        unitId = tenantRecord.unitId || null;
      } else {
        // Management direct-record: a tenant must be picked; the unit is
        // resolved from the tenant record so the estate stays consistent.
        if (!validated.tenantId) {
          return NextResponse.json({ success: false, error: 'Select a tenant' }, { status: 400 });
        }
        const tenant = await prisma.tenant.findUnique({
          where: { id: validated.tenantId },
          include: { unit: true },
        });
        if (!tenant) {
          return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
        }
        if (!tenant.unitId) {
          return NextResponse.json(
            { success: false, error: 'This tenant has no unit assigned. Assign a unit first.' },
            { status: 400 }
          );
        }
        tenantId = tenant.id;
        unitId = tenant.unitId;
      }
    }

    // ---------- Amount ----------
    // Invoice payments default to the outstanding balance and are capped at it,
    // so a tenant can never overpay (which would inflate amountPaid past totalAmount).
    let amount: number;
    if (invoice) {
      amount = Math.min(validated.amount ?? invoice.balance, invoice.balance);
      if (amount <= 0) {
        return NextResponse.json({ success: false, error: 'This invoice is already fully paid' }, { status: 400 });
      }
    } else {
      amount = validated.amount!;
    }

    const phoneNumber =
      validated.phoneNumber ||
      (invoice ? invoice.tenant?.phone : null) ||
      tenantRecordPhone ||
      null;

    // Create the payment record (PENDING until confirmed).
    // Tenants always pay via M-Pesa — the method is forced so a tenant-supplied
    // value (e.g. 'CASH') can never label a real M-Pesa transaction incorrectly.
    const payment = await prisma.payment.create({
      data: {
        amount,
        status: 'PENDING',
        method: isTenant ? 'MPESA_STK_PUSH' : validated.method || 'MPESA_STK_PUSH',
        description: invoice ? `Payment for ${invoice.invoiceNumber}` : 'Rent payment',
        phoneNumber,
        balanceBefore: invoice ? invoice.balance : null,
        tenantId,
        unitId,
        invoiceId: invoice?.id ?? null,
        recordedById: session.userId,
      },
    });

    // Hosted-link path: create the PENDING record and return immediately — the
    // tenant completes payment on the PalPluss checkout page and the webhook
    // finalizes the record (matched by phone + amount). Cancel any earlier
    // PENDING link records for the same invoice (checkoutRequestId is null only
    // for link-created records, so an in-flight STK push is never cancelled)
    // so the webhook's unique-match fallback can never see an ambiguous
    // phone+amount pair.
    if (isTenant && validated.payViaLink) {
      await prisma.payment.updateMany({
        where: {
          id: { not: payment.id },
          tenantId: payment.tenantId,
          invoiceId: invoice?.id ?? undefined,
          status: 'PENDING',
          checkoutRequestId: null,
        },
        data: { status: 'CANCELLED' },
      });
      return NextResponse.json(
        {
          success: true,
          data: {
            paymentId: payment.id,
            status: 'PENDING',
            message: 'Complete your payment on the secure payment link.',
          },
        },
        { status: 201 }
      );
    }

    // M-Pesa path: push an STK prompt to the tenant's phone. Tenants always go
    // through PalPluss (which sends an M-Pesa STK prompt) — they can never
    // self-confirm a payment by passing a method.
    if (isTenant) {
      const phone = phoneNumber || '';
      if (!phone) {
        return NextResponse.json(
          { success: false, error: 'Enter your M-Pesa phone number' },
          { status: 400 }
        );
      }
      const accountReference = invoice
        ? invoice.invoiceNumber
        : unitId
          ? `RENT-${unitId.slice(-5).toUpperCase()}`
          : 'RENT';
      if (isPalplussConfigured()) {
        try {
          const stk = await stkPush(phone, amount, accountReference, 'Rent payment');
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
    const completed = await finalizePayment(payment.id, {
      transactionCode: `DIR${Date.now().toString(36).toUpperCase()}`,
      phoneNumber,
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
