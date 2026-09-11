import { PalPluss, PalPlussApiError, RateLimitError } from '@palpluss/sdk';

// Lazily-created shared client: the SDK throws at construction when the API
// key is missing, which previously crashed the whole /api/payments route at
// import time. Building it on first use keeps simulation mode (no key) alive.
let _palpluss: PalPluss | undefined;

export function getPalpluss(): PalPluss {
  if (!_palpluss) {
    _palpluss = new PalPluss({
      apiKey: process.env.PALPLUSS_API_KEY,
      timeout: 30_000,
      autoRetryOnRateLimit: true,
      maxRetries: 3,
    });
  }
  return _palpluss;
}

export { PalPlussApiError, RateLimitError };

/** Normalizes a Kenyan phone number to the 2547XXXXXXXX format PalPluss expects. */
export function formatPhoneNumber(phone: string): string {
  return phone.replace(/^0+/, '254').replace(/^\+/, '');
}

/** Webhook URL that PalPluss calls after an STK push completes. */
export function getWebhookUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/payments/palpluss-callback`;
}

/** Optional payment wallet channel id (see PALPLUSS_CHANNEL_ID). */
export function getChannelId(): string | undefined {
  return process.env.PALPLUSS_CHANNEL_ID || undefined;
}

export interface StkPushResult {
  transactionId: string;
  status: string;
}

/**
 * Initiates an STK push via PalPluss. The customer receives an M-Pesa PIN
 * prompt on their phone; the outcome arrives at the PalPluss webhook route.
 */
export async function stkPush(
  phoneNumber: string,
  amount: number,
  accountReference: string,
  transactionDesc: string
): Promise<StkPushResult> {
  const tx = await getPalpluss().stkPush({
    amount: Math.round(amount),
    phone: formatPhoneNumber(phoneNumber),
    accountReference,
    transactionDesc,
    callbackUrl: getWebhookUrl(),
    channelId: getChannelId(),
  });

  return { transactionId: tx.transactionId, status: tx.status };
}

/** Fetches a single transaction by PalPluss transaction id (for polling). */
export async function queryStatus(transactionId: string) {
  return getPalpluss().getTransaction(transactionId);
}

// NOTE: queryStatus and b2cPayment are kept for API parity with the previous
// M-Pesa module and are not currently wired into the app. b2cPayout is only
// usable after the tenant's KYC is approved.

/** B2C payout — sends money from the service wallet to a phone number. */
export async function b2cPayment(
  phoneNumber: string,
  amount: number,
  reference: string,
  description?: string
) {
  return getPalpluss().b2cPayout(
    {
      amount: Math.round(amount),
      phone: formatPhoneNumber(phoneNumber),
      reference,
      description,
    },
    // Always supply an idempotency key so retries never double-pay.
    { idempotencyKey: `${reference}-${Date.now()}` }
  );
}
