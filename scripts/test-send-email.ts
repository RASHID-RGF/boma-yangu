import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import sendEmail from '../src/lib/notifications/smtp';

async function main() {
  try {
    const to = process.env.SMTP_USER;
    if (!to) throw new Error('SMTP_USER is not set in environment');

    const res = await sendEmail({
      to,
      subject: 'Boma Yangu — SMTP test',
      text: 'This is a test message sent from scripts/test-send-email.ts',
    });

    console.log('Send result:', res);
  } catch (err) {
    console.error('Error sending email:', err);
    process.exit(1);
  }
}

main();
