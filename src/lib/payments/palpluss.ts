import { PalPluss, PalPlussApiError, RateLimitError } from '@palpluss/sdk';
import { formatPhoneNumber } from './phone';

// Lazily-created shared client: the SDK throws at construction when the API
// key is missing, which previously crashed the whole /api/payments route at
// import time. Building it on first use keeps simulation mode (no key) alive.
let _palpluss: PalPluss | undefined;

export function getPalpluss(): PalPluss {

  if (!_palpluss) {
    const apiKey =
      process.env.PALPLUSS_API_KEY ||
      process.env['PALPLUSS API KEY'] ||
      process.env.ALPLUSS_API_KEY ||
      process.env['ALPLUSS API KEY'];
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

// Phone helpers moved to the client-safe module (payment forms import them
// without pulling the SDK into the browser bundle); re-exported so existing
// imports keep working.
export {
  formatPhoneNumber,
  isValidSafaricomPhoneNumber,
  normalizePhoneForMatch,
} from './phone';

/** Webhook URL that PalPluss calls after an STK push completes. */
export function getWebhookUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/payments/palpluss-callback`;
}

/** Platform default payment wallet channel id (see PALPLUSS_CHANNEL_ID). */
export function getChannelId(): string | undefined {
  return (
    process.env.PALPLUSS_CHANNEL_ID ||
    process.env['PALPLUSS CHANNEL ID'] ||
    process.env.ALPLUSS_CHANNEL_ID ||
    process.env['ALPLUSS CHANNEL ID'] ||
    undefined
  );
}

/**
 * Resolves the PalPluss channel for a rent payment.
 *
 * The destination is locked to the platform's collection channel (the fixed
 * Buy Goods till) — any property/landlord channel id is deliberately ignored.
 */
export function resolveChannelId(
  _propertyChannelId?: string | null
): string | undefined {
  return getChannelId();
}

export interface StkPushResult {
  transactionId: string;
  status: string;
}

/**
 * Initiates an STK push via PalPluss. The customer receives an M-Pesa PIN
 * prompt on their phone; the outcome arrives at the PalPluss webhook route.
 *
 * The money always lands on the platform's collection channel (the fixed Buy
 * Goods till, PLATFORM_TILL_NUMBER) — landlord/property channels are never
 * used.
 */
export async function stkPush(
  phoneNumber: string,
  amount: number,
  accountReference: string,
  transactionDesc: string
): Promise<StkPushResult> {
  const channelId = getChannelId();
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

/**
 * Lists recent transactions from the PalPluss account. Used to reconcile
 * hosted pay-link payments: those transactions are created on PalPluss's
 * side (outside the API), so the app has no transaction id to poll — instead
 * it searches this list for a matching phone + amount.
 */
export async function listRecentTransactions(limit = 20) {
  const page = await getPalpluss().listTransactions({ limit, type: 'STK' });
  return page.items;
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
