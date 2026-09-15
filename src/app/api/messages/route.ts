import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { isManagementRole } from '@/lib/auth/rbac';
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

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // A user sees messages they sent or received.
    const messages = await prisma.message.findMany({
      where: { OR: [{ receiverId: session.userId }, { senderId: session.userId }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, role: true } },
        receiver: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });

    // Contacts to pick from when composing. Tenants can only message the estate team
    // (management + caretaker); staff can message anyone except themselves.
    const contacts = await prisma.user.findMany({
      where: isManagementRole(session.role)
        ? { id: { not: session.userId } }
        : { id: { not: session.userId }, role: { in: ['LANDLORD', 'MANAGER', 'SUPER_ADMIN', 'CARETAKER'] } },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: { firstName: 'asc' },
    });

    return NextResponse.json({ success: true, data: messages, contacts });
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

    const message = await prisma.message.create({
      data: {
        senderId: session.userId,
        receiverId: receiver.id,
        subject: validated.subject,
        content: validated.content,
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, role: true } },
        receiver: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });

    const sender = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { firstName: true, lastName: true },
    });

    const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() : 'A Boma Yangu user';
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

    // Only the recipient can mark a message as read.
    const result = await prisma.message.updateMany({
      where: { id, receiverId: session.userId },
      data: { isRead: true, readAt: new Date() },
    });

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
