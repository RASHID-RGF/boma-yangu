import nodemailer from "nodemailer";

type EmailOptions = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

// Defer reading env vars and creating transporter until send time

export async function sendEmail({ to, subject, text, html }: EmailOptions) {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = Number((process.env.SMTP_PORT || '465').trim());
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();
  const from = (process.env.SMTP_FROM || process.env.EMAIL_FROM || '').trim();

  if (!from) throw new Error("SMTP_FROM or EMAIL_FROM environment variable is not set");
  if (!to) throw new Error("Missing 'to' address for sendEmail");

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    return info;
  } catch (err: any) {
    if (err && err.responseCode === 535) {
      const guidance = '\nGmail rejected authentication (535). Common causes:\n' +
        '- Wrong password or not using a Google App Password (generate at https://myaccount.google.com/apppasswords)\n' +
        "- Account needs 2FA enabled before creating an app password\n" +
        "- Less secure app access blocked by Google\n";
      err.message = `${err.message}${guidance}`;
    }
    throw err;
  }
}

export default sendEmail;
