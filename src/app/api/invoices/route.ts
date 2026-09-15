import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';
import { isManagementRole } from '@/lib/auth/rbac';
import { invoiceSchema } from '@/lib/utils/validation';
import { generateInvoiceNumber } from '@/lib/utils/format';
import { logActivity, extractIpAddress } from '@/lib/db/activity-logger';
import { sendPortalNoticeEmail } from '@/lib/notifications/communication';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // TENANT sees only their own invoices; management sees everything;
    // CARETAKER sees invoices for the properties they are assigned to.
    const tenantRecord = session.role === 'TENANT' ? await ensureTenantRecord(session.userId) : null;

    // A tenant account without a linked Tenant record must never see estate-wide data.
    if (session.role === 'TENANT' && !tenantRecord) {
      return NextResponse.json({
        success: true,
        data: [],
        stats: { outstanding: 0, count: 0, overdueCount: 0 },
      });
    }

    // Caretakers: resolve assigned property ids for monitor-only scoping.
    let caretakerPropertyIds: string[] | null = null;
    if (session.role === 'CARETAKER') {
      const assignments = await prisma.caretakerAssignment.findMany({
        where: { caretakerId: session.userId },
        select: { propertyId: true },
      });
      caretakerPropertyIds = assignments.map((a) => a.propertyId);
    }

    const invoices = await prisma.invoice.findMany({
      where: tenantRecord
        ? { tenantId: tenantRecord.id }
        : caretakerPropertyIds
          ? { unit: { propertyId: { in: caretakerPropertyIds } } }
          : {},
      orderBy: { dueDate: 'desc' },
      include: {
        tenant: { select: { firstName: true, lastName: true } },
        unit: { select: { unitNumber: true } },
        createdBy: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    const outstanding = invoices
      .filter((i) => i.status === 'SENT' || i.status === 'OVERDUE')
      .reduce((sum, i) => sum + i.balance, 0);
    const overdueCount = invoices.filter((i) => i.status === 'OVERDUE').length;

    return NextResponse.json({
      success: true,
      data: invoices,
      stats: { outstanding, count: invoices.length, overdueCount },
    });
  } catch (error) {
    console.error('List invoices error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = invoiceSchema.parse(body);

    // Resolve the invoice's tenant/unit:
    // - Management sends invoices to any tenant (tenantId from the form; the unit
    //   is derived from the tenant record).
    // - A TENANT sends an invoice to their landlord using their own tenant record.
    let tenantId = validated.tenantId || '';
    let unitId = validated.unitId || '';
    let tenantRecord = null;

    if (!isManagementRole(session.role)) {
      tenantRecord = await ensureTenantRecord(session.userId);
      if (!tenantRecord) {
        return NextResponse.json(
          { success: false, error: 'No tenant profile linked to this account.' },
          { status: 400 }
        );
      }
      tenantId = tenantRecord.id;
      unitId = tenantRecord.unitId || '';
    } else if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Select a tenant' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { user: true, unit: { include: { property: true } } },
    });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // The unit belongs to the tenant — always resolve it from the tenant record
    // so management only needs to pick the tenant.
    if (!unitId && tenant.unitId) unitId = tenant.unitId;
    if (!unitId) {
      return NextResponse.json(
        { success: false, error: 'This tenant has no unit assigned. Assign a unit first.' },
        { status: 400 }
      );
    }

    // Build the invoice number: INV-YYYYMM-####, incrementing past the highest
    // existing sequence for that month/year (avoids collisions with seeded data).
    const existing = await prisma.invoice.findMany({
      where: { month: validated.month, year: validated.year },
      select: { invoiceNumber: true },
    });
    const maxSeq = existing.reduce((max, inv) => {
      const match = inv.invoiceNumber.match(/-(\d{4})$/);
      const seq = match ? parseInt(match[1], 10) : 0;
      return Math.max(max, seq);
    }, 0);
    const invoiceNumber = generateInvoiceNumber(validated.month, validated.year, maxSeq + 1);

    const totalAmount =
      validated.rentAmount +
      validated.waterCharge +
      validated.electricityCharge +
      validated.garbageCharge +
      validated.serviceCharge +
      validated.internetCharge +
      validated.parkingCharge +
      validated.otherCharges;

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        month: validated.month,
        year: validated.year,
        rentAmount: validated.rentAmount,
        waterCharge: validated.waterCharge,
        electricityCharge: validated.electricityCharge,
        garbageCharge: validated.garbageCharge,
        serviceCharge: validated.serviceCharge,
        internetCharge: validated.internetCharge,
        parkingCharge: validated.parkingCharge,
        otherCharges: validated.otherCharges,
        totalAmount,
        amountPaid: 0,
        balance: totalAmount,
        dueDate: new Date(validated.dueDate),
        status: 'SENT',
        notes: validated.notes,
        tenantId,
        unitId,
        createdById: session.userId,
      },
    });

    // Notify the other side: tenant is told about a landlord invoice, and the
    // property owner is told when a tenant raises an invoice.
    try {
      const isTenantSent = !isManagementRole(session.role);
      const property = tenant.unit?.property;
      const ownerId = property?.ownerId;

      if (!isTenantSent) {
        // Landlord -> tenant notification + message + email.
        if (tenant.userId) {
          await prisma.notification.create({
            data: {
              userId: tenant.userId,
              type: 'INVOICE_GENERATED',
              title: `Invoice ${invoiceNumber}`,
              message: `Your rent invoice for KES ${totalAmount.toLocaleString()} is ready and due on ${new Date(validated.dueDate).toDateString()}.`,
            },
          });
          await prisma.message.create({
            data: {
              senderId: session.userId,
              receiverId: tenant.userId,
              subject: `Invoice ${invoiceNumber}`,
              content: `Your invoice for KES ${totalAmount.toLocaleString()} (${validated.month}/${validated.year}) is ready. Due ${new Date(validated.dueDate).toDateString()}.`,
            },
          });

          const tenantUser = await prisma.user.findUnique({
            where: { id: tenant.userId },
            select: { email: true, firstName: true, lastName: true },
          });
          if (tenantUser?.email) {
            await sendPortalNoticeEmail({
              to: tenantUser.email,
              recipientName: `${tenantUser.firstName} ${tenantUser.lastName}`.trim() || tenantUser.email,
              subject: `Invoice ${invoiceNumber}`,
              content: `Your rent invoice for KES ${totalAmount.toLocaleString()} is ready. Due ${new Date(validated.dueDate).toDateString()}.`,
              category: 'Invoice',
            });
          }
        }
      } else if (ownerId && ownerId !== session.userId) {
        // Tenant -> landlord notification
        await prisma.notification.create({
          data: {
            userId: ownerId,
            type: 'INVOICE_GENERATED',
            title: `Invoice from ${tenant.firstName} ${tenant.lastName}`,
            message: `${tenant.firstName} sent invoice ${invoiceNumber} for KES ${totalAmount.toLocaleString()}.`,
          },
        });

        const owner = await prisma.user.findUnique({
          where: { id: ownerId },
          select: { email: true, firstName: true, lastName: true },
        });
        if (owner?.email) {
          await sendPortalNoticeEmail({
            to: owner.email,
            recipientName: `${owner.firstName} ${owner.lastName}`.trim() || owner.email,
            subject: `Invoice from ${tenant.firstName} ${tenant.lastName}`,
            content: `${tenant.firstName} ${tenant.lastName} sent invoice ${invoiceNumber} for KES ${totalAmount.toLocaleString()}.`,
            category: 'Invoice',
          });
        }
      }
    } catch (notifyError) {
      console.error('Invoice notification error:', notifyError);
    }

    // Log the invoice creation activity
    logActivity({
      action: 'INVOICE_CREATED',
      description: `Invoice ${invoiceNumber} created for KES ${totalAmount.toLocaleString()}`,
      entityType: 'INVOICE',
      entityId: invoice.id,
      userId: session.userId,
      ipAddress: extractIpAddress(request),
    });

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Create invoice error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create invoice' }, { status: 500 });
  }
}
