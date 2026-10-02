import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';
import { isManagementRole } from '@/lib/auth/rbac';

import {
  isValidSafaricomPhoneNumber,
  stkPush as palplussStkPush,
  PalPlussApiError,
} from '@/lib/payments/palpluss';
import { stkPush as darajaStkPush, DarajaApiError } from '@/lib/payments/daraja';
import {
  stkPush as payheroStkPush,
  packPayheroIds,
  PayheroApiError,
} from '@/lib/payments/payhero';
import { finalizePayment, isStkProviderConfigured, getStkProvider } from '@/lib/payments/finalize';
import { isPayLinkConfigured } from '@/lib/payments/pay-link-server';
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
  // (or the sync-link reconciliation) finalizes it when the tenant completes
  // the hosted checkout.
  payViaLink: z.boolean().optional(),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // TENANT sees only their own payments; management sees everything.
    // Self-registered tenant accounts get a Tenant profile auto-created here so
    // they are never stuck with a dead-end "no linked tenant" error.
    const tenantRecord = session.role === 'TENANT' ? await ensureTenantRecord(session.userId) : null;

    // A tenant account without a linked Tenant record must never see estate-wide data.
    if (session.role === 'TENANT' && !tenantRecord) {
      return NextResponse.json({
        success: true,
        data: [],
        stats: { totalPaid: 0, count: 0, pendingCount: 0 },
      });
    }

    // Scope to the landlord's own properties (or all for super admin).
    let managementPropertyFilter: any = null;
    if (isManagementRole(session.role) && session.role !== 'SUPER_ADMIN') {
      const properties = await prisma.property.findMany({
        where: {
          ownerId: session.userId,
        },
        select: { id: true },
      });
      managementPropertyFilter = properties.map((p) => p.id);
    }

    const payments = await prisma.payment.findMany({
      where: tenantRecord
        ? { tenantId: tenantRecord.id }
        : managementPropertyFilter
          ? { unit: { propertyId: { in: managementPropertyFilter } } }
          : {},
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
    // Set from the tenant's allocated room. A tenant must have a room before
    // they can pay (see the guard in the direct-payment branch below).
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
        // A tenant pays for the room the landlord allocated to them — a tenant
        // with no room has nothing to pay for yet.
        if (!tenantRecord.unitId) {
          return NextResponse.json(
            {
              success: false,
              error: 'You have not been allocated a room yet. Contact your landlord to assign one.',
            },
            { status: 400 }
          );
        }
        tenantRecordPhone = tenantRecord.phone || null;
        tenantId = tenantRecord.id;
        unitId = tenantRecord.unitId;
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

    // Prefer the phone number the user typed in the payment form for STK
    // pushes. Only fall back to the stored tenant phone (or invoice user's
    // phone) when the user did not provide one.
    const preferredPhone = validated.phoneNumber?.trim() || null;
    const phoneNumber =
      preferredPhone || tenantRecordPhone || (invoice ? invoice.tenant?.phone : null) || null;

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

    // Only the newest STK push for a tenant should remain active. Older
    // PENDING M-Pesa payments are stale and can otherwise be matched by the
    // callback/status polling logic and keep the countdown alive even after the
    // customer has already completed the latest payment.
    await prisma.payment.updateMany({
      where: {
        tenantId: payment.tenantId,
        status: 'PENDING',
        method: 'MPESA_STK_PUSH',
        id: { not: payment.id },
      },
      data: { status: 'CANCELLED' },
    });

    // Hosted-link path: create the PENDING record and return immediately — the
    // tenant completes payment on the PalPluss checkout page and the webhook
    // finalizes the record (matched by phone + amount). Cancel any earlier
    // PENDING link records for the same invoice (checkoutRequestId is null only
    // for link-created records, so an in-flight STK push is never cancelled)
    // so the webhook's unique-match fallback can never see an ambiguous
    // phone+amount pair.
    if (isTenant && validated.payViaLink) {
      if (!isPayLinkConfigured()) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
        return NextResponse.json(
          { success: false, error: 'Payment link is not available. Contact the administrator.' },
          { status: 503 }
        );
      }
      if (!isValidSafaricomPhoneNumber(phoneNumber)) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
        return NextResponse.json(
          { success: false, error: 'Enter a valid Safaricom mobile number — it identifies your payment at checkout.' },
          { status: 400 }
        );
      }
      // The record is finalized by the webhook or the sync-link reconciliation
      // matching on phone + amount — mark it as a link payment so those paths
      // can pick it out unambiguously.
      await prisma.payment.update({
        where: { id: payment.id },
        data: { method: 'MPESA_PAY_LINK' },
      });
      // Cancel earlier OPEN link records for this tenant so exactly one
      // PENDING MPESA_PAY_LINK record exists at a time — the webhook's
      // phone+amount fallback and the sync reconciliation can then never see
      // an ambiguous match (checkoutRequestId is null only for link records,
      // so an in-flight STK push is never cancelled).
      await prisma.payment.updateMany({
        where: {
          id: { not: payment.id },
          tenantId: payment.tenantId,
          status: 'PENDING',
          method: 'MPESA_PAY_LINK',
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
            // Echoed to the checkout so the tenant pays from the same number
            // the record was created with (the webhook matches on phone).
            phoneNumber,
            message: 'Complete your payment on the secure payment link.',
          },
        },
        { status: 201 }
      );
    }

    console.log('[Payment] Resolved phone:', phoneNumber, 'tenantId:', tenantId, 'unitId:', unitId);

    // M-Pesa path: push an STK prompt to the tenant's phone. The phone
    // number MUST be the one the user entered — the STK prompt is sent to
    // exactly that number so the right person receives the PIN prompt.
    if (isTenant) {
      // Ensure the STK prompt is targeted at the phone the tenant entered.
      const phone = (preferredPhone || tenantRecordPhone || '') as string;
      if (!phone) {
        return NextResponse.json(
          { success: false, error: 'Enter your M-Pesa phone number to receive the payment prompt' },
          { status: 400 }
        );
      }
      if (!isValidSafaricomPhoneNumber(phone)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Enter a valid Safaricom mobile number that can receive the M-Pesa prompt. Update your profile if needed.',
          },
          { status: 400 }
        );
      }
      const accountReference = invoice
        ? invoice.invoiceNumber
        : unitId
          ? `RENT-${unitId.slice(-5).toUpperCase()}`
          : 'RENT';
      const accountRef = accountReference;

      // ---- STK Push: PayHero (platform provider), Daraja as fallback ----
      // The PIN prompt is sent to exactly the phone number the tenant entered.
      // There is no simulation path: an unconfigured provider or a provider
      // error fails the request loudly instead of recording money that never
      // moved.
      if (!isStkProviderConfigured()) {
        console.error('[Payment] No STK provider configured — aborting STK push');
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
        return NextResponse.json(
          {
            success: false,
            error:
              'M-Pesa payments are not configured. Set PALPLUSS_API_KEY / PAYHERO_BASIC_AUTH_TOKEN / DARAJA_* credentials and the matching channel id.',
          },
          { status: 503 }
        );
      }

      const provider = getStkProvider();
      try {
        console.log(
          `[Payment] ${provider} STK push → phone:`,
          phone,
          'amount:',
          amount,
          'ref:',
          accountRef
        );
        // PayHero needs two ids later — its own `reference` (the status-query
        // key) and Safaricom's `CheckoutRequestID` (the webhook's match key) —
        // but there is only one column, so they are packed as
        // `reference|CheckoutRequestID`. The `|` also marks the owning provider,
        // letting the status route and the callback route route the payment
        // without a schema change. Daraja only ever has the CheckoutRequestID.
        let storedRequestId: string;
        if (provider === 'PAYHERO') {
          const stk = await payheroStkPush(phone, amount, accountRef);
          storedRequestId = packPayheroIds(stk.transactionId, stk.checkoutRequestId);
        } else if (provider === 'PALPLUSS') {
          // Route the collected rent to the property's own PalPluss channel
          // (landlord's till/paybill); falls back to the platform default
          // channel when the property has none.
          const stk = await palplussStkPush(phone, amount, accountRef, 'Rent payment', unitId);
          storedRequestId = stk.transactionId;
        } else {
          const stk = await darajaStkPush(phone, amount, accountRef, 'Rent payment');
          storedRequestId = stk.transactionId;
        }

        await prisma.payment.update({
          where: { id: payment.id },
          data: { checkoutRequestId: storedRequestId },
        });
        return NextResponse.json(
          {
            success: true,
            data: {
              paymentId: payment.id,
              status: 'PENDING',
              // Echoed to the checkout so the tenant can see which number
              // received the prompt.
              phoneNumber: phone,
              message: `Payment prompt sent to ${phone}. Enter your M-Pesa PIN to complete the payment.`,
            },
          },
          { status: 201 }
        );
      } catch (stkError) {
        console.error(`[Payment] ${provider} STK push failed:`, stkError);
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
        if (
          stkError instanceof PayheroApiError ||
          stkError instanceof DarajaApiError ||
          stkError instanceof PalPlussApiError
        ) {
          const status =
            stkError.httpStatus >= 400 && stkError.httpStatus < 600 ? stkError.httpStatus : 502;
          return NextResponse.json(
            { success: false, error: stkError.message || 'Could not reach M-Pesa. Please try again.' },
            { status }
          );
        }
        return NextResponse.json(
          { success: false, error: 'Could not reach M-Pesa. Please try again.' },
          { status: 502 }
        );
      }
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
    console.error('Create payment error:', error?.message || error);
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    // Surface PalPluss errors to the browser so the user sees
    // the real reason instead of a generic "Failed to record payment".
    const msg = error?.message || 'Failed to record payment';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
