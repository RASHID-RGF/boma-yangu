import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/jwt';
import { isManagementRole } from '@/lib/auth/rbac';
import { getPalpluss } from '@/lib/payments/palpluss';
import { isPalplussConfigured } from '@/lib/payments/finalize';
import { PLATFORM_TILL_NUMBER } from '@/lib/payments/platform';

/**
 * POST /api/properties/[id]/channel
 *
 * The payment destination is locked to the platform's Buy Goods till
 * (PLATFORM_TILL_NUMBER) — properties cannot register their own till/paybill,
 * so this endpoint always refuses with the fixed destination.
 */

export async function POST(_request: Request, { params }: { params: { id: string } }) {
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
    if (session.role !== 'SUPER_ADMIN' && property.ownerId !== session.userId) {
      return NextResponse.json({ success: false, error: 'You do not own this property' }, { status: 403 });
    }

    // Locked: rent always collects to the platform Buy Goods till.
    return NextResponse.json(
      {
        success: false,
        error: `Rent is collected to M-Pesa Buy Goods Till ${PLATFORM_TILL_NUMBER} — this cannot be changed.`,
      },
      { status: 403 }
    );
  } catch (error) {
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
    if (session.role !== 'SUPER_ADMIN' && property.ownerId !== session.userId) {
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
