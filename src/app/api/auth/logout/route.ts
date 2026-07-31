import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth/jwt';

export async function POST() {
  try {
    clearSession();
    return NextResponse.json({ success: true, message: 'Logged out successfully' });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Logout failed' },
      { status: 500 }
    );
  }
}
