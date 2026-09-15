interface SendSmsParams {
  to: string;
  message: string;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendSms({ to, message }: SendSmsParams): Promise<boolean> {
  try {
    // Africa's Talking SMS Integration
    const username = process.env.AFRICASTALKING_USERNAME;
    const apiKey = process.env.AFRICASTALKING_API_KEY;

    if (!username || !apiKey) {
      console.warn('SMS credentials not configured');
      return false;
    }

    const response = await fetch(
      'https://api.africastalking.com/version1/messaging',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'apiKey': apiKey,
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          username,
          to: to.replace(/^0+/, '+254'),
          message,
          from: 'BomaYangu',
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error('Failed to send SMS:', error);
    return false;
  }
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
  try {
    const response = await fetch('/api/notifications/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html }),
    });

    const payload = await response.json().catch(() => ({ success: response.ok }));
    return Boolean(payload.success ?? response.ok);
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

export function generateRentDueMessage(tenantName: string, amount: number, dueDate: string): string {
  return `Dear ${tenantName}, your rent of KES ${amount.toLocaleString()} is due on ${dueDate}. Please pay via M-Pesa Paybill ###### Account: [Your Account]. - Boma Yangu`;
}

export function generatePaymentReceivedMessage(tenantName: string, amount: number, receiptNo: string): string {
  return `Dear ${tenantName}, we have received your payment of KES ${amount.toLocaleString()}. Receipt No: ${receiptNo}. Thank you! - Boma Yangu`;
}

export function generateMaintenanceUpdateMessage(tenantName: string, status: string, title: string): string {
  return `Dear ${tenantName}, your maintenance request "${title}" has been updated to: ${status}. - Boma Yangu`;
}

export function generateLeaseExpiryMessage(tenantName: string, endDate: string): string {
  return `Dear ${tenantName}, your lease agreement will expire on ${endDate}. Please contact us to discuss renewal. - Boma Yangu`;
}

export function generateInvoiceEmailHtml(
  tenantName: string,
  invoiceNumber: string,
  month: string,
  year: number,
  totalAmount: number,
  dueDate: string
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #059669; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">Boma Yangu</h1>
        <p style="margin: 5px 0 0 0;">Rental Management</p>
      </div>
      <div style="padding: 20px; background: #f9fafb;">
        <h2>Invoice #${invoiceNumber}</h2>
        <p>Dear ${tenantName},</p>
        <p>Please find your invoice for ${month} ${year}.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: #f3f4f6;">
            <td style="padding: 10px; border: 1px solid #d1d5db;">Total Amount</td>
            <td style="padding: 10px; border: 1px solid #d1d5db; font-weight: bold;">KES ${totalAmount.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #d1d5db;">Due Date</td>
            <td style="padding: 10px; border: 1px solid #d1d5db;">${dueDate}</td>
          </tr>
        </table>
        <p>Please make payment via:</p>
        <ul>
          <li>M-Pesa Paybill: ###### - Account: [Your Account]</li>
          <li>M-Pesa Till Number: ######</li>
          <li>Bank Transfer: [Bank Details]</li>
        </ul>
        <p style="color: #dc2626; font-weight: bold;">Please pay before the due date to avoid late fees.</p>
      </div>
      <div style="padding: 10px; text-align: center; color: #6b7280; font-size: 12px;">
        <p>Boma Yangu - Making Rental Management Easy</p>
        <p>Contact: support@bomayangu.com | Tel: 0712 345 678</p>
      </div>
    </div>
  `;
}
