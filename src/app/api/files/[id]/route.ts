import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { isManagementRole } from '@/lib/auth/rbac';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';

/**
 * GET /api/files/[id]
 *
 * Serves an attachment's bytes stored in-app so the recipient can view the
 * file inline (PDFs render in the browser's viewer; images render natively).
 *
 * Access: sender, receiver, the uploader, their linked tenant, or management
 * who owns the tenant's property. Anyone else gets a 404 that does not leak
 * whether the file exists.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: params.id },
      include: {
        message: { select: { senderId: true, receiverId: true } },
        documents: {
          select: {
            id: true,
            tenantId: true,
            property: { select: { ownerId: true } },
            tenant: { select: { unit: { select: { property: { select: { ownerId: true } } } } } },
          },
        },
      },
    });
    if (!attachment) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    // Resolve the tenant record of TENANT-role accounts for scoping.
    const tenantRecord = !isManagementRole(session.role)
      ? await ensureTenantRecord(session.userId)
      : null;
    const tenantId = tenantRecord?.id ?? null;

    // Management may view attachments on documents filed against their own
    // properties (via the document's property or the tenant's unit's property).
    const ownsDocumentProperty = (d: {
      property?: { ownerId: string } | null;
      tenant?: { unit?: { property?: { ownerId: string } } | null } | null;
    }) => d.property?.ownerId === session.userId || d.tenant?.unit?.property?.ownerId === session.userId;

    const allowed =
      attachment.message?.senderId === session.userId ||
      attachment.message?.receiverId === session.userId ||
      attachment.uploadedById === session.userId ||
      (!!tenantId && attachment.documents.some((d) => d.tenantId === tenantId)) ||
      (isManagementRole(session.role) && attachment.documents.some(ownsDocumentProperty)) ||
      (session.role === 'SUPER_ADMIN' && attachment.documents.length > 0);

    if (!allowed) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const download = url.searchParams.get('download') === '1';
    const filename = attachment.filename.replace(/[^a-zA-Z0-9._ -]/g, '_');

    return new NextResponse(new Uint8Array(attachment.data), {
      status: 200,
      headers: {
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('File serve error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load file' }, { status: 500 });
  }
}
