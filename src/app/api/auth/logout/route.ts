import { NextResponse } from 'next/server';
import { clearSession, getSession } from '@/lib/auth/jwt';
import { logActivity, extractIpAddress } from '@/lib/db/activity-logger';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    clearSession();

    // Log the logout action (best-effort, after session is cleared)
    if (session) {
      logActivity({
        action: 'USER_LOGOUT',
        description: `${session.email} logged out`,
        entityType: 'USER',
        entityId: session.userId,
        userId: session.userId,
        ipAddress: extractIpAddress(request),
      });
    }

    return NextResponse.json({ success: true, message: 'Logged out successfully' });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Logout failed' },
      { status: 500 }
    );
  }
}
