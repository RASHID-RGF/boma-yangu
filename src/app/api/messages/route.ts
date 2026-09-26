import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { isManagementRole } from '@/lib/auth/rbac';
import { ensureTenantRecord } from '@/lib/auth/tenant-scope';
import { logActivity, extractIpAddress } from '@/lib/db/activity-logger';
import { findUserByEmail, sendPortalNoticeEmail } from '@/lib/notifications/communication';
import { z } from 'zod';

const sendMessageSchema = z
  .object({
    receiverId: z.string().optional(),
    receiverEmail: z.string().email('Enter a valid recipient email').optional(),
    subject: z.string().min(2, 'Subject must be at least 2 characters'),
    content: z.string().min(2, 'Message must be at least 2 characters'),
  })
  .refine((data) => !!data.receiverId || !!data.receiverEmail, {
    message: 'Select a recipient or enter a valid email address',
    path: ['receiverId'],
  });

const markReadSchema = z.object({
  id: z.string().min(1),
});

const CONTACT_SELECT = { id: true, firstName: true, lastName: true, role: true } as const;
type ContactRow = { id: string; firstName: string; lastName: string; role: string };

/**
 * Contacts linked to a set of properties: the owner(s) (landlord) plus every
 * active, room-allocated tenant who has signed up for an account.
 */
async function contactsForProperties(propertyIds: string[], selfId: string): Promise<ContactRow[]> {
  const contacts: ContactRow[] = [];

  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds } },
    select: { ownerId: true },
  });
  const ownerIds = Array.from(new Set(properties.map((p) => p.ownerId))).filter(
    (id) => id !== selfId
  );
  if (ownerIds.length > 0) {
    const owners = await prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: CONTACT_SELECT,
    });
    contacts.push(...owners);
  }

  const tenants = await prisma.tenant.findMany({
    where: {
      unitId: { not: null },
      unit: { propertyId: { in: propertyIds } },
      isActive: true,
      userId: { not: null },
    },
    select: { userId: true },
  });
  const tenantUserIds = Array.from(
    new Set(tenants.map((t) => t.userId).filter((id): id is string => !!id && id !== selfId))
  );
  if (tenantUserIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: tenantUserIds } },
      select: CONTACT_SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    for (const u of users) {
      if (!contacts.find((c) => c.id === u.id)) contacts.push(u);
    }
  }

  return contacts;
}

async function findContactUsers(roles: string[], selfId: string): Promise<ContactRow[]> {
  return prisma.user.findMany({
    where: { role: { in: roles }, id: { not: selfId } },
    select: CONTACT_SELECT,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Tenant: resolve their room context (unit + property) for the UI.
    const tenantRecord = !isManagementRole(session.role)
      ? await ensureTenantRecord(session.userId)
      : null;

    // A user sees messages they sent or received.
    const messages = await prisma.message.findMany({
      where: { OR: [{ receiverId: session.userId }, { senderId: session.userId }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, role: true } },
        receiver: { select: { id: true, firstName: true, lastName: true, role: true } },
        unit: { select: { id: true, unitNumber: true } },
        tenant: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Contacts to pick from when composing. Every role gets a sensible list:
    // estate-wide roles see landlords + tenants, landlords see the tenants of
    // ALL their properties, caretakers see their assigned properties, and
    // tenants see their landlord + co-tenants (or all landlords until a room
    // is allocated to them).
    let contacts: ContactRow[] = [];
    let contactsNote: string | null = null;

    if (session.role === 'SUPER_ADMIN' || session.role === 'MANAGER') {
      // Estate-wide roles can message any landlord or tenant.
      contacts = await findContactUsers(['LANDLORD', 'TENANT'], session.userId);
    } else if (session.role === 'CARETAKER') {
      const assignments = await prisma.caretakerAssignment.findMany({
        where: { caretakerId: session.userId },
        select: { propertyId: true },
      });
      const propertyIds = assignments.map((a) => a.propertyId);
      if (propertyIds.length > 0) {
        contacts = await contactsForProperties(propertyIds, session.userId);
      } else {
        contactsNote = 'You are not assigned to any property yet.';
      }
    } else if (isManagementRole(session.role)) {
      // Landlord: tenants with accounts in ALL their properties.
      const properties = await prisma.property.findMany({
        where: { ownerId: session.userId },
        select: { id: true },
      });
      if (properties.length > 0) {
        contacts = await contactsForProperties(
          properties.map((p) => p.id),
          session.userId
        );
        if (contacts.length === 0) {
          contactsNote =
            'No tenants yet — tenants appear here once they are added to your properties and sign up.';
        }
      } else {
        contactsNote = 'Add a property first — your tenants will appear here.';
      }
    } else if (tenantRecord?.unit?.propertyId) {
      // Tenant with an allocated room: their landlord + co-tenants.
      contacts = await contactsForProperties([tenantRecord.unit.propertyId], session.userId);
    } else {
      // Tenant without a room yet: fall back to all landlords/admins so they
      // can still reach management (e.g. to ask about allocation).
      contacts = await findContactUsers(['LANDLORD', 'SUPER_ADMIN'], session.userId);
      if (contacts.length === 0) {
        contactsNote = 'No landlords available yet.';
      }
    }

    if (contacts.length === 0 && !contactsNote) {
      contactsNote = 'No contacts available yet.';
    }

    // Room context for the tenant's UI.
    const room = tenantRecord?.unit
      ? {
          id: tenantRecord.unit.id,
          unitNumber: tenantRecord.unit.unitNumber,
          property: tenantRecord.unit.property
            ? { id: tenantRecord.unit.property.id, name: tenantRecord.unit.property.name }
            : null,
        }
      : null;

    return NextResponse.json({ success: true, data: messages, contacts, contactsNote, room });
  } catch (error) {
    console.error('List messages error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = sendMessageSchema.parse(body);

    const receiver = validated.receiverId
      ? await prisma.user.findUnique({
          where: { id: validated.receiverId },
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        })
      : await findUserByEmail(validated.receiverEmail);

    if (!receiver) {
      return NextResponse.json({ success: false, error: 'Recipient not found' }, { status: 404 });
    }
    if (receiver.id === session.userId) {
      return NextResponse.json({ success: false, error: 'You cannot message yourself' }, { status: 400 });
    }

    // Attach room context (tenantId + unitId) so the message is room-scoped,
    // exactly like payments and invoices.
    let tenantRecordId: string | undefined;
    let unitRecordId: string | undefined;
    if (!isManagementRole(session.role)) {
      // Tenant → Landlord: use the sender's own tenant record.
      const tenantRecord = await ensureTenantRecord(session.userId);
      if (tenantRecord) {
        tenantRecordId = tenantRecord.id;
        unitRecordId = tenantRecord.unitId || undefined;
      }
    } else if (receiver.role === 'TENANT') {
      // Landlord → Tenant: find the recipient's tenant record so the message
      // is tagged with the tenant's room, not the landlord's profile.
      const recipientTenant = await prisma.tenant.findFirst({
        where: { userId: receiver.id },
        select: { id: true, unitId: true },
      });
      if (recipientTenant) {
        tenantRecordId = recipientTenant.id;
        unitRecordId = recipientTenant.unitId || undefined;
      }
    }

    const message = await prisma.message.create({
      data: {
        senderId: session.userId,
        receiverId: receiver.id,
        subject: validated.subject,
        content: validated.content,
        ...(tenantRecordId ? { tenantId: tenantRecordId } : {}),
        ...(unitRecordId ? { unitId: unitRecordId } : {}),
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, role: true } },
        receiver: { select: { id: true, firstName: true, lastName: true, role: true } },
        unit: { select: { id: true, unitNumber: true } },
      },
    });

    const sender = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { firstName: true, lastName: true },
    });

    const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() : 'A Boma Yangu user';

    // In-app notification: this is what raises the popup on the recipient's
    // screen and lands the message in their Notifications list (the email
    // below is the off-site copy). Best-effort — a notification failure must
    // never fail an already-delivered message.
    try {
      await prisma.notification.create({
        data: {
          userId: receiver.id,
          type: 'MESSAGE',
          title: `New message from ${senderName}`,
          message:
            validated.content.length > 160
              ? `${validated.subject} — ${validated.content.slice(0, 160).trimEnd()}…`
              : `${validated.subject} — ${validated.content}`,
          messageId: message.id,
          sentViaEmail: true,
        },
      });
    } catch (notifyError) {
      console.error('Message notification error:', notifyError);
    }

    await sendPortalNoticeEmail({
      to: receiver.email,
      recipientName: `${receiver.firstName} ${receiver.lastName}`.trim() || receiver.email,
      subject: validated.subject,
      content: `${senderName} sent you a new message: ${validated.content}`,
      category: 'Message',
    });

    // Log the message sent
    logActivity({
      action: 'MESSAGE_SENT',
      description: `Message "${validated.subject}" sent to ${receiver.firstName} ${receiver.lastName}`,
      entityType: 'MESSAGE',
      entityId: message.id,
      userId: session.userId,
      ipAddress: extractIpAddress(request),
    });

    return NextResponse.json({ success: true, data: message }, { status: 201 });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Send message error:', error);
    return NextResponse.json({ success: false, error: 'Failed to send message' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { id } = markReadSchema.parse(body);
    if (!id) {
      // Without this guard an undefined id would drop the filter and mark
      // every message the user ever received as read.
      return NextResponse.json({ success: false, error: 'Message id is required' }, { status: 400 });
    }

    // Only the recipient can mark a message as read.
    const result = await prisma.message.updateMany({
      where: { id, receiverId: session.userId },
      data: { isRead: true, readAt: new Date() },
    });

    // Reading the message also clears the popup/badge raised for it.
    try {
      await prisma.notification.updateMany({
        where: { userId: session.userId, messageId: id, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
    } catch (notifyError) {
      console.error('Message notification sync error:', notifyError);
    }

    return NextResponse.json({ success: true, data: { updated: result.count } });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    console.error('Mark message read error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update message' }, { status: 500 });
  }
}
