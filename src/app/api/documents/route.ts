import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';
import { isManagementRole } from '@/lib/auth/rbac';
import { logActivity, extractIpAddress } from '@/lib/db/activity-logger';
import { sendPortalNoticeEmail } from '@/lib/notifications/communication';
import { z } from 'zod';

const createDocumentSchema = z.object({
  name: z.string().min(2, 'Document name is required'),
  type: z.enum(['LEASE', 'INVOICE', 'RECEIPT', 'ID', 'KRA', 'OTHER']).default('OTHER'),
  // A link to the file (e.g. Google Drive / Cloudinary). Optional for now —
  // documents can be recorded without a URL and the link added later.
  url: z.string().optional(),
  // Management only: which tenant the document belongs to. Tenants can only
  // add documents to their own profile.
  tenantId: z.string().optional(),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // A tenant sees documents linked to their tenant record (lease, invoices, etc.).
    // Self-registered accounts get their Tenant profile auto-created here.
    const tenantRecord = !isManagementRole(session.role) ? await ensureTenantRecord(session.userId) : null;

    // A tenant account without a linked Tenant record must never see estate-wide data.
    if (!isManagementRole(session.role) && !tenantRecord) {
      return NextResponse.json({
        success: true,
        data: [],
        stats: { count: 0, byType: {} },
      });
    }

    const documents = await prisma.document.findMany({
      where: tenantRecord
        ? { OR: [{ tenantId: tenantRecord.id }, { uploadedById: session.userId }] }
        : {},
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: { select: { firstName: true, lastName: true } },
        property: { select: { name: true } },
      },
    });

    const byType = documents.reduce<Record<string, number>>((acc, d) => {
      acc[d.type] = (acc[d.type] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: documents,
      stats: { count: documents.length, byType },
    });
  } catch (error) {
    console.error('List documents error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch documents' }, { status: 500 });
  }
}

/**
 * POST /api/documents
 * Adds a document to the database. Tenants can only add documents to their own
 * profile; management can add a document for any tenant (or unassigned).
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createDocumentSchema.parse(body);

    // Resolve the owning tenant + property:
    // - A TENANT uploads to their own tenant record (always scoped).
    // - Management may choose a tenant (the property is derived from the unit).
    let tenantId: string | null = null;
    let propertyId: string | null = null;

    if (!isManagementRole(session.role)) {
      const tenantRecord = await ensureTenantRecord(session.userId);
      if (!tenantRecord) {
        return NextResponse.json(
          { success: false, error: 'No tenant profile linked to this account.' },
          { status: 400 }
        );
      }
      tenantId = tenantRecord.id;
      propertyId = tenantRecord.unit?.propertyId ?? null;
    } else if (validated.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: validated.tenantId },
        include: { unit: true },
      });
      if (!tenant) {
        return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
      }
      tenantId = tenant.id;
      propertyId = tenant.unit?.propertyId ?? null;
    }

    const document = await prisma.document.create({
      data: {
        name: validated.name,
        type: validated.type,
        url: validated.url || '#',
        uploadedById: session.userId,
        tenantId,
        propertyId,
      },
      include: {
        uploadedBy: { select: { firstName: true, lastName: true } },
        property: { select: { name: true } },
      },
    });

    if (validated.type === 'LEASE' || validated.type === 'INVOICE') {
      const tenantProfile = tenantId
        ? await prisma.tenant.findUnique({
            where: { id: tenantId },
            include: { user: { select: { email: true, firstName: true, lastName: true } } },
          })
        : null;
      const targetEmail = tenantProfile?.user?.email;
      if (tenantProfile?.user && targetEmail) {
        const recipientName = `${tenantProfile.user.firstName} ${tenantProfile.user.lastName}`.trim() || targetEmail;
        await sendPortalNoticeEmail({
          to: targetEmail,
          recipientName,
          subject: `${validated.type}: ${validated.name}`,
          content: `A new ${validated.type.toLowerCase()} document has been uploaded and is available in your Boma Yangu account.`,
          category: validated.type,
        });
      }
    }

    // Log the document upload
    logActivity({
      action: 'DOCUMENT_UPLOADED',
      description: `Document "${validated.name}" (${validated.type}) uploaded`,
      entityType: 'DOCUMENT',
      entityId: document.id,
      userId: session.userId,
      propertyId,
      ipAddress: extractIpAddress(request),
    });

    return NextResponse.json({ success: true, data: document }, { status: 201 });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Create document error:', error);
    return NextResponse.json({ success: false, error: 'Failed to add document' }, { status: 500 });
  }
}
