import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { isManagementRole } from '@/lib/auth/rbac';
import { z } from 'zod';
import { getPalpluss, PalPlussApiError } from '@/lib/payments/palpluss';
import { isPalplussConfigured } from '@/lib/payments/finalize';

/**
 * POST /api/properties/[id]/channel
 *
 * Multi-landlord collections: registers the landlord's own M-Pesa till or
 * paybill for a property as a PalPluss payment channel, and stores the channel
 * id on the property. Every rent STK push for this property is then routed to
 * THAT landlord's till/paybill — money lands in the landlord's own account,
 * not a platform pot.
 *
 * Body: { type: 'TILL' | 'PAYBILL', shortcode, accountName?, accountNumber? }
 */
const registerChannelSchema = z.object({
  type: z.enum(['TILL', 'PAYBILL']),
  // The landlord's Buy Goods till number or Paybill number.
  shortcode: z
    .string()
    .trim()
    .min(5, 'Enter the till/paybill number')
    .max(12, 'Till/paybill numbers are at most 12 digits')
    .regex(/^\d+$/, 'Till/paybill must be digits only'),
  // Display name on the channel (usually the property or business name).
  accountName: z.string().trim().max(80).optional(),
  // Paybill account number (only used with PAYBILL type).
  accountNumber: z.string().trim().max(30).optional(),
});


export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!isManagementRole(session.role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const property = await prisma.property.findUnique({ where: { id: params.id } });
    if (!property) {
      return NextResponse.json({ success: false, error: 'Property not found' }, { status: 404 });
    }
    if (session.role !== 'SUPER_ADMIN' && property.ownerId !== session.userId && property.managerId !== session.userId) {
      return NextResponse.json({ success: false, error: 'You do not own this property' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const validated = registerChannelSchema.parse(body);

    if (!isPalplussConfigured()) {
      return NextResponse.json(
        { success: false, error: 'PalPluss is not configured on this platform. Contact support.' },
        { status: 503 }
      );
    }

    // Create a dedicated PalPluss channel for this landlord's till/paybill.
    const client = getPalpluss();
    const channel = await client.createChannel({
      type: validated.type,
      shortcode: validated.shortcode,
      name: validated.accountName || property.name,
      accountNumber: validated.accountNumber || undefined,
      isDefault: false,
    });

    // Persist both the display details and the routing id on the property.
    const updated = await prisma.property.update({
      where: { id: params.id },
      data: {
        palplussChannelId: channel.id,
        mpesaTillNumber: validated.type === 'TILL' ? validated.shortcode : property.mpesaTillNumber,
        mpesaPaybill: validated.type === 'PAYBILL' ? validated.shortcode : property.mpesaPaybill,
        mpesaAccountName: validated.accountName || property.mpesaAccountName,
      },
    });


    return NextResponse.json({
      success: true,
      data: {
        channelId: channel.id,
        channelType: channel.type,
        shortcode: channel.shortcode,
        property: updated,
      },
    });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    if (error instanceof PalPlussApiError) {
      // Surface PalPluss rejections (bad till, duplicate, unauthorized) verbatim
      // so the landlord knows immediately whether their number is usable.
      return NextResponse.json(
        { success: false, error: `PalPluss: ${error.message}` },
        { status: error.httpStatus }
      );
    }
    console.error('Register property channel error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to register the payment channel' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/properties/[id]/channel
 * Detaches the property's custom channel: rent falls back to the platform
 * default collection channel.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!isManagementRole(session.role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const property = await prisma.property.findUnique({ where: { id: params.id } });
    if (!property) {
      return NextResponse.json({ success: false, error: 'Property not found' }, { status: 404 });
    }
    if (session.role !== 'SUPER_ADMIN' && property.ownerId !== session.userId && property.managerId !== session.userId) {
      return NextResponse.json({ success: false, error: 'You do not own this property' }, { status: 403 });
    }// Best-effort delete on PalPluss; keep going even if it fails (the channel
// may already be gone) — the property row is the source of truth.
    if (property.palplussChannelId && isPalplussConfigured()) {
      try {
        await getPalpluss().deleteChannel(property.palplussChannelId);
      } catch (err) {
        console.warn('PalPluss channel delete failed (continuing):', err);
      }
    }

    await prisma.property.update({
      where: { id: params.id },
      data: { palplussChannelId: null },
    });



    return NextResponse.json({ success: true, data: { channelId: null } });
  } catch (error) {
    console.error('Remove property channel error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove the payment channel' },
      { status: 500 }
    );
  }
}
