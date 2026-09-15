import { PalPluss, PalPlussApiError, RateLimitError } from '@palpluss/sdk';

// Lazily-created shared client: the SDK throws at construction when the API
// key is missing, which previously crashed the whole /api/payments route at
// import time. Building it on first use keeps simulation mode (no key) alive.
let _palpluss: PalPluss | undefined;

export function getPalpluss(): PalPluss {
  if (!_palpluss) {
    const apiKey = process.env.PALPLUSS_API_KEY || process.env['PALPLUSS API KEY'];
    _palpluss = new PalPluss({
      apiKey,
      timeout: 30_000,
      autoRetryOnRateLimit: true,
      maxRetries: 3,
    });
  }
  return _palpluss;
}

export { PalPlussApiError, RateLimitError };

/**
 * Normalizes a Kenyan phone number to the 2547XXXXXXXX format PalPluss expects.
 * Accepts common inputs such as 0712345678, +254 712 345678, 254712345678,
 * and 0712-345-678 without failing the STK push.
 */
export function formatPhoneNumber(phone: string): string {
  const digits = phone.trim().replace(/\D/g, '');

  if (!digits) {
    throw new Error('Phone number is required');
  }

  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  return `254${digits}`;
}

/**
 * Accepts only Kenyan mobile formats that can realistically receive a Safaricom
 * STK prompt. This catches invalid or stale numbers before the app attempts a
 * live payment push and surfaces a clearer tenant message to update their
 * profile with an active M-Pesa number.
 */
export function isValidSafaricomPhoneNumber(phone: string | null | undefined): boolean {
  if (!phone) return false;

  const digits = phone.trim().replace(/\D/g, '');
  if (!digits) return false;

  // Accept 07XXXXXXXX / 070XXXXXXXX and +2547XXXXXXXX / 2547XXXXXXXX.
  const local = digits.startsWith('0') ? digits : digits.startsWith('254') ? `0${digits.slice(3)}` : digits;
  return /^0[17]\d{8}$/.test(local);
}

/** Webhook URL that PalPluss calls after an STK push completes. */
export function getWebhookUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/payments/palpluss-callback`;
}

/** Platform default payment wallet channel id (see PALPLUSS_CHANNEL_ID). */
export function getChannelId(): string | undefined {
  return process.env.PALPLUSS_CHANNEL_ID || process.env['PALPLUSS CHANNEL ID'] || undefined;
}

/**
 * Resolves the PalPluss channel for a rent payment. Multi-landlord platform:
 * each property may carry its own channel (the landlord's own till/paybill,
 * registered via /api/properties/[id]/channel). Falls back to the platform
 * default channel when the property has none — so payments NEVER fail just
 * because a landlord hasn't onboarded their till yet.
 */
export function resolveChannelId(
  propertyChannelId?: string | null
): string | undefined {
  const own = propertyChannelId?.trim();
  if (own) return own;
  return getChannelId();
}

export interface StkPushResult {
  transactionId: string;
  status: string;
}

/**
 * Initiates an STK push via PalPluss. The customer receives an M-Pesa PIN
 * prompt on their phone; the outcome arrives at the PalPluss webhook route.
 * `channelId` routes the money to a specific landlord's till/paybill — omit
 * it to use the platform default channel.
 */
export async function stkPush(
  phoneNumber: string,
  amount: number,
  accountReference: string,
  transactionDesc: string,
  channelId?: string | null
): Promise<StkPushResult> {
  const tx = await getPalpluss().stkPush({
    amount: Math.round(amount),
    phone: formatPhoneNumber(phoneNumber),
    accountReference,
    transactionDesc,
    callbackUrl: getWebhookUrl(),
    channelId: channelId || undefined,
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
