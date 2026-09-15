import { NextResponse } from 'next/server';
import { sendEmailPayload } from '@/lib/notifications/communication';
import { z } from 'zod';

const sendEmailSchema = z.object({
  to: z.string().email('A valid email is required'),
  subject: z.string().min(1, 'Subject is required'),
  html: z.string().min(1, 'Email body is required'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = sendEmailSchema.parse(body);

    const ok = await sendEmailPayload({
      to: validated.to,
      subject: validated.subject,
      html: validated.html,
    });

    return NextResponse.json({ success: ok, data: { sent: ok } });
  } catch (error: any) {
    if (error?.errors) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }

    console.error('Send email route error:', error);
    return NextResponse.json({ success: false, error: 'Failed to send email' }, { status: 500 });
  }
}
