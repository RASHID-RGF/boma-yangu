import nodemailer from 'nodemailer';
import prisma from '@/lib/db/prisma';
import { normalizeEmail } from '@/lib/utils/contact';

export function resolveUserByEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  return {
    id: '',
    email: normalized,
    firstName: '',
    lastName: '',
    role: 'TENANT',
  };
}

export async function findUserByEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  return prisma.user.findFirst({
    where: { email: { equals: normalized, mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      phone: true,
    },
  });
}

export function buildEmailHtml(
  recipientName: string,
  subject: string,
  bodyText = '',
  category = 'Update'
) {
  const safeName = (recipientName || 'there').replace(/</g, '&lt;');
  const safeSubject = (subject || 'Boma Yangu update').replace(/</g, '&lt;');
  const safeBody = (bodyText || 'Please log in to Boma Yangu to review the update.').replace(/</g, '&lt;');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #f5f7fb; padding: 24px; color: #1f2937;">
      <div style="background: linear-gradient(135deg, #111827, #1f2937); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 28px;">Boma Yangu</h2>
        <p style="margin: 8px 0 0; opacity: 0.8;">${category}</p>
      </div>
      <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);">
        <p style="margin: 0 0 12px; font-size: 16px;">Hi ${safeName},</p>
        <h3 style="margin: 0 0 16px; font-size: 22px; color: #111827;">${safeSubject}</h3>
        <p style="line-height: 1.7; margin: 0 0 16px; color: #374151;">${safeBody}</p>
        <p style="margin: 0; color: #374151;">Please login to your Boma Yangu account to view the full message and keep track of the latest updates.</p>
      </div>
    </div>
  `;
}

export function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '465');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || user || 'noreply@bomayangu.local';

  return {
    host,
    port,
    user,
    pass,
    from,
    enabled: Boolean(host && user && pass),
  };
}

export async function sendEmailPayload({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const normalized = normalizeEmail(to);
  if (!normalized) {
    console.warn('Missing email target while sending notification');
    return false;
  }

  const smtp = getSmtpConfig();
  if (smtp.enabled) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        },
      });

      const info = await transporter.sendMail({
        from: smtp.from,
        to: normalized,
        subject,
        html,
        text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      });

      console.info(`SMTP email sent: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('SMTP email failed:', error);
      return false;
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || 'noreply@bomayangu.local';

  if (!apiKey || apiKey === 'demo') {
    console.info(`Email notification queued for ${normalized}: ${subject}`);
    return true;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [normalized],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      console.error('Resend email failed:', payload);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Email notification failed:', error);
    return false;
  }
}

export async function sendPortalNoticeEmail({
  to,
  recipientName,
  subject,
  content,
  category,
}: {
  to?: string | null;
  recipientName?: string | null;
  subject: string;
  content: string;
  category: string;
}) {
  if (!to) return false;

  const emailHtml = buildEmailHtml(recipientName || 'there', subject, content, category);
  return sendEmailPayload({
    to,
    subject: `${category}: ${subject}`,
    html: emailHtml,
  });
}
