/**
 * Payhero (backend.payhero.co.ke) — M-Pesa STK push provider.
 *
 * This is the platform's payment provider. The rest of the app only depends on
 * three seams, so the adapter stays small and provider-agnostic upstream:
 *
 *   stkPush(...)   → POST  /api/v2/payments              fires the PIN prompt
 *   queryStatus(..)→ GET   /api/v2/transaction-status    webhook-free polling
 *   callback       → POST  /api/payments/payhero-callback (public route)
 *
 * Docs: https://docs.payhero.co.ke/docs/post-initiate-mpesa-stk-push-request
 */

const BASE_URL = 'https://backend.payhero.co.ke/api/v2';

/** Payhero rejects the request outright (bad channel, bad payload). */
export class PayheroApiError extends Error {
  readonly httpStatus: number;
  readonly details: unknown;

  constructor(message: string, httpStatus: number, details?: unknown) {
    super(message);
    this.name = 'PayheroApiError';
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * True when Payhero credentials are present. Kept lazy/no-throw so importing
 * this module (or reading the config in a route) can never crash the process.
 */
export function isPayheroConfigured(): boolean {
  return Boolean(getAuthHeader());
}

/**
 * Basic auth header. Prefer the pre-computed token (PAYHERO_BASIC_AUTH_TOKEN,
 * the exact value Payhero's docs hand you) and fall back to building it from
 * the username/password pair.
 */
export function getAuthHeader(): string {
  const token = process.env.PAYHERO_BASIC_AUTH_TOKEN?.trim() || process.env.PAYHERO_BASIC_AUTH?.trim();
  if (token) return token.startsWith('Basic ') ? token : `Basic ${token}`;

  const username = process.env.PAYHERO_API_USERNAME?.trim();
  const password = process.env.PAYHERO_API_PASSWORD?.trim();
  if (!username || !password) return '';

  const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

/** Public webhook URL Payhero posts the payment result to. */
export function getWebhookUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/+$/, '')}/api/payments/payhero-callback`;
}

/**
 * Resolves the Payhero payment channel (an integer registered under
 * Payment Channels → My Payment Channels).
 *
 * `propertyChannelId` is the per-property collection channel. Payhero channel
 * ids are numeric, so a non-numeric value (a legacy PalPluss channel UUID) is
 * ignored and the platform default is used instead — a property can never break
 * its own tenants' STK pushes.
 */
export function resolveChannelId(propertyChannelId?: string | null): number | undefined {
  const own = propertyChannelId?.trim();
  if (own && /^\d+$/.test(own)) return Number(own);

  const fallback = process.env.PAYHERO_CHANNEL_ID?.trim();
  if (fallback && /^\d+$/.test(fallback)) return Number(fallback);
  return undefined;
}

/** Platform default Payhero channel id, if configured. */
export function getChannelId(): number | undefined {
  return resolveChannelId(undefined);
}

// ---------------------------------------------------------------------------
// Phone formatting
// ---------------------------------------------------------------------------

/**
 * Payhero's documented example uses the local form (`0787677676`), while our
 * records and matchers standardise on `2547XXXXXXXX`. Convert to the local
 * form right before sending so the prompt lands on the number the tenant typed.
 */
export function formatPhoneForPayhero(phone: string): string {
  const digits = phone.trim().replace(/\D/g, '');
  if (!digits) throw new PayheroApiError('Phone number is required', 400);

  const e164 = digits.startsWith('254')
    ? digits
    : digits.startsWith('0')
      ? `254${digits.slice(1)}`
      : `254${digits}`;

  return `0${e164.slice(3)}`;
}

// ---------------------------------------------------------------------------
// checkoutRequestId packing
// ---------------------------------------------------------------------------

/**
 * Payhero needs TWO ids later, but `Payment.checkoutRequestId` is a single
 * column:
 *   - `reference`        → the query key for GET /transaction-status
 *   - `CheckoutRequestID`→ the match key inside the webhook payload
 *
 * Store them as `reference|CheckoutRequestID`. The `|` also acts as the
 * provider marker: PalPluss ids never contain it, so the status route can tell
 * which provider owns a pending payment without a schema change.
 */
export function packPayheroIds(reference: string, checkoutRequestId?: string | null): string {
  return `${reference}|${checkoutRequestId ?? ''}`;
}

/** Inverse of {@link packPayheroIds}; null for values this adapter did not write. */
export function unpackPayheroIds(value: string | null | undefined): {
  reference: string;
  checkoutRequestId: string;
} | null {
  if (!value || !value.includes('|')) return null;
  const [reference, checkoutRequestId = ''] = value.split('|');
  if (!reference) return null;
  return { reference, checkoutRequestId };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function request(path: string, init?: RequestInit): Promise<any> {
  const auth = getAuthHeader();
  if (!auth) {
    throw new PayheroApiError('Payhero is not configured. Set PAYHERO_API_USERNAME and PAYHERO_API_PASSWORD.', 503);
  }

  const url = path.startsWith('http') ? path : `${BASE_URL}/${path.replace(/^\/+/, '')}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    // Transport failure — the request never produced an answer.
    throw new PayheroApiError(
      `Could not reach Payhero: ${error instanceof Error ? error.message : String(error)}`,
      0
    );
  }

  const text = await res.text().catch(() => '');
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const base =
      (typeof body?.message === 'string' && body.message) ||
      (typeof body?.error_message === 'string' && body.error_message) ||
      (typeof body?.error === 'string' && body.error) ||
      (typeof body?.detail === 'string' && body.detail) ||
      (Array.isArray(body?.errors) && body.errors.map((e: any) => e?.message || e).join(', ')) ||
      text.slice(0, 300) ||
      `Payhero request failed with status ${res.status}`;
    // Payhero's refusals are `{error_code, error_message}` shaped — without
    // reading those the tenant would see raw JSON in the payment toast. The
    // code is appended so it stays greppable, and account-level refusals get a
    // pointer to where they are actually fixed.
    const code = typeof body?.error_code === 'string' ? body.error_code : '';
    const message =
      `${base}${code ? ` (${code})` : ''}` +
      (code === 'PERMISSION_DENIED'
        ? '. Check your merchant account status in the PayHero dashboard (app.payhero.co.ke).'
        : '');
    throw new PayheroApiError(message, res.status, body);
  }

  // Payhero can answer 200 with a failure envelope — never let that look like success.
  if (body && body.success === false) {
    const message =
      (typeof body.message === 'string' && body.message) ||
      (typeof body.error === 'string' && body.error) ||
      'Payhero rejected the request';
    throw new PayheroApiError(message, 400, body);
  }

  return body;
}

// ---------------------------------------------------------------------------
// STK push
// ---------------------------------------------------------------------------

export interface StkPushResult {
  /** Payhero's `reference` — pass to {@link queryStatus}. */
  transactionId: string;
  status: string;
  /** Safaricom `CheckoutRequestID` — the webhook's match key. */
  checkoutRequestId?: string | null;
}

/**
 * Fires an M-Pesa STK push to `phoneNumber`. The prompt is sent to exactly the
 * number supplied — there is no simulation path and no silent fallback, so if
 * Payhero cannot accept the request the caller gets an error instead of a
 * fabricated success.
 *
 * NOTE: Payhero blocks a phone number for 24h after 10 successive failed or
 * cancelled prompts, and restricts the account after 50 failures in 6h. A
 * single deliberate attempt is therefore safer than aggressive retrying.
 */
export async function stkPush(
  phoneNumber: string,
  amount: number,
  accountReference: string,
  channelId?: number | null,
  customerName?: string | null
): Promise<StkPushResult> {
  const channel = channelId ?? getChannelId();
  if (!channel) {
    throw new PayheroApiError(
      'PAYHERO_CHANNEL_ID is not set. Register a payment channel in the Payhero dashboard (Payment Channels → My Payment Channels) and add its id to .env.',
      503
    );
  }

  const payload: Record<string, unknown> = {
    amount: Math.round(amount),
    phone_number: formatPhoneForPayhero(phoneNumber),
    channel_id: channel,
    provider: 'm-pesa',
    external_reference: accountReference,
    callback_url: getWebhookUrl(),
  };
  if (customerName) payload.customer_name = customerName;

  const body = await request('payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const reference = body?.reference || body?.CheckoutRequestID;
  if (!reference) {
    throw new PayheroApiError('Payhero did not return a transaction reference', 502, body);
  }

  return {
    transactionId: String(reference),
    status: String(body?.status ?? 'QUEUED'),
    checkoutRequestId: body?.CheckoutRequestID ? String(body.CheckoutRequestID) : null,
  };
}

// ---------------------------------------------------------------------------
// Status query (webhook fallback)
// ---------------------------------------------------------------------------

export interface PayheroTransactionStatus {
  /** Normalised to the vocabulary the status route switches on. */
  status: 'QUEUED' | 'SUCCESS' | 'FAILED';
  reference?: string;
  checkoutRequestId?: string;
  amount?: number;
  phone?: string;
  /** M-Pesa receipt when Payhero reports one. */
  mpesaReceipt?: string;
  resultCode?: number;
  resultDesc?: string;
}

const FAILED_STATUS = /fail|cancel|expired|reject|revers/i;

function pickAmount(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/**
 * Asks Payhero for the outcome of an STK push — the fallback that lets the
 * payment flow finish when the webhook cannot reach us (local dev has no
 * public URL, transient network errors).
 *
 * Only terminal answers are meaningful; a QUEUED response simply means "keep
 * waiting for the callback".
 */
export async function queryStatus(reference: string): Promise<PayheroTransactionStatus> {
  const body = await request(
    `transaction-status?reference=${encodeURIComponent(reference)}`
  );

  // Payhero's response shape has changed across versions — read defensively
  // instead of depending on one nesting level.
  const tx = body?.transaction ?? body?.data ?? body ?? {};
  const rawStatus = String(
    body?.status ?? tx.status ?? tx.Status ?? tx.transaction_status ?? ''
  ).toUpperCase();

  const resultCode =
    tx.ResultCode !== undefined && tx.ResultCode !== null && tx.ResultCode !== ''
      ? Number(tx.ResultCode)
      : tx.result_code !== undefined && tx.result_code !== null && tx.result_code !== ''
        ? Number(tx.result_code)
        : undefined;

  // M-Pesa ResultCode is authoritative when present (0 = money moved); the
  // status string only decides when no code was reported.
  let status: PayheroTransactionStatus['status'];
  if (resultCode !== undefined && !Number.isNaN(resultCode)) {
    status = resultCode === 0 ? 'SUCCESS' : 'FAILED';
  } else if (rawStatus === 'SUCCESS') {
    status = 'SUCCESS';
  } else if (rawStatus === 'FAILED' || FAILED_STATUS.test(rawStatus)) {
    status = 'FAILED';
  } else {
    status = 'QUEUED';
  }

  return {
    status,
    reference: body?.reference ?? tx.reference ?? reference,
    checkoutRequestId: body?.CheckoutRequestID ?? tx.CheckoutRequestID ?? undefined,
    amount: pickAmount(tx.Amount, tx.amount, body?.Amount, body?.amount),
    phone:
      tx.phone_number ??
      tx.Phone ??
      tx.phone ??
      body?.phone_number ??
      body?.Phone ??
      undefined,
    mpesaReceipt:
      tx.MpesaReceiptNumber ?? tx.mpesa_receipt ?? tx.mpesaReceipt ?? body?.MpesaReceiptNumber ?? undefined,
    resultCode,
    resultDesc: tx.ResultDesc ?? tx.result_desc ?? tx.message ?? body?.message ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Webhook payload
// ---------------------------------------------------------------------------

export interface ParsedPayheroCallback {
  checkoutRequestId?: string;
  externalReference?: string;
  amount: number;
  phone?: string;
  mpesaReceipt?: string;
  resultCode?: number;
  resultDesc?: string;
  rawStatus?: string;
  succeeded: boolean;
  failed: boolean;
}

/**
 * Shapes Payhero's callback (https://docs.payhero.co.ke/docs/payment-callback)
 * into the fields the shared finalisation path needs:
 *
 *   { forward_url, status, response: { Amount, CheckoutRequestID,
 *     ExternalReference, MpesaReceiptNumber, Phone, ResultCode, ResultDesc,
 *     Status } }
 *
 * A bare `response` object is accepted too, so a payload change on Payhero's
 * side degrades to "unknown outcome" (acknowledged, left PENDING) rather than a
 * hard failure the tenant would never recover from.
 *
 * Throws when the body is not a payment callback at all.
 */
export function parseCallback(raw: string): ParsedPayheroCallback {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON');
  }

  const r = parsed?.response ?? parsed;
  if (!r || typeof r !== 'object') throw new Error('Invalid payload');

  const hasSignal =
    r.CheckoutRequestID != null ||
    r.ExternalReference != null ||
    r.MpesaReceiptNumber != null ||
    r.ResultCode != null ||
    r.Status != null;
  if (!hasSignal) throw new Error('Invalid payload');

  const resultCode = r.ResultCode !== undefined && r.ResultCode !== null && r.ResultCode !== ''
    ? Number(r.ResultCode)
    : undefined;
  const rawStatus = typeof r.Status === 'string' ? r.Status : undefined;

  // ResultCode wins when present: 0 means M-Pesa accepted the payment. The
  // Status string is only consulted when no code was reported, so a confusing
  // payload can never downgrade a payment that actually settled.
  let succeeded: boolean;
  let failed: boolean;
  if (resultCode !== undefined && !Number.isNaN(resultCode)) {
    succeeded = resultCode === 0;
    failed = resultCode !== 0;
  } else if (rawStatus !== undefined) {
    succeeded = /^success$/i.test(rawStatus.trim());
    failed = !succeeded && FAILED_STATUS.test(rawStatus);
  } else {
    succeeded = false;
    failed = false;
  }

  const amount = Number(r.Amount ?? r.amount ?? 0);

  return {
    checkoutRequestId: r.CheckoutRequestID ? String(r.CheckoutRequestID) : undefined,
    externalReference: r.ExternalReference ? String(r.ExternalReference) : undefined,
    amount: Number.isFinite(amount) ? amount : 0,
    phone: r.Phone ?? r.phone_number ?? r.phone ?? undefined,
    mpesaReceipt: r.MpesaReceiptNumber ?? r.mpesa_receipt ?? undefined,
    resultCode,
    resultDesc: r.ResultDesc ?? r.result_desc ?? undefined,
    rawStatus,
    succeeded: succeeded && !failed,
    failed,
  };
}
