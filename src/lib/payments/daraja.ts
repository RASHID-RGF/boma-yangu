/**
 * Safaricom Daraja — M-Pesa Express (Lipa na M-Pesa Online) STK push.
 *
 * This is the platform's payment provider. Daraja's `CheckoutRequestID` serves
 * as both the callback match key and the status-query key, so a payment needs
 * exactly one stored id (no packing).
 *
 *   Auth    → GET  /oauth/v1/generate?grant_type=client_credentials
 *   Push    → POST /mpesa/stkpush/v1/processrequest
 *   Query   → POST /mpesa/stkpushquery/v1/query
 *   Callback→ POST /api/payments/daraja-callback
 *
 * Docs: https://developer.safaricom.co.ke/M-PesaExpress
 */

const NAIROBI = 'Africa/Nairobi';

/** Daraja errors carry the HTTP status the payment route surfaces to the browser. */
export class DarajaApiError extends Error {
  readonly httpStatus: number;
  readonly details: unknown;

  constructor(message: string, httpStatus: number, details?: unknown) {
    super(message);
    this.name = 'DarajaApiError';
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function isDarajaConfigured(): boolean {
  return Boolean(
    process.env.DARAJA_CONSUMER_KEY?.trim() &&
      process.env.DARAJA_CONSUMER_SECRET?.trim() &&
      getShortcode() &&
      process.env.DARAJA_PASSKEY?.trim()
  );
}

/** Sandbox vs live. Live is the default — this platform takes real money. */
export function getBaseUrl(): string {
  const env = (process.env.DARAJA_ENV || 'production').toLowerCase();
  return env === 'sandbox' ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';
}

export function isSandbox(): boolean {
  return getBaseUrl().includes('sandbox');
}

export function getShortcode(): string | undefined {
  return process.env.DARAJA_SHORTCODE?.trim() || undefined;
}

/** PartyB — where the money lands. Defaults to the shortcode (paybill). */
function getPartyB(): string {
  return process.env.DARAJA_PARTY_B?.trim() || getShortcode() || '';
}

/**
 * `CustomerPayBillOnline` (paybill) or `CustomerBuyGoodsOnline` (till/buy
 * goods). The buy-goods form needs the till in DARAJA_PARTY_B.
 */
function getTransactionType(): string {
  return process.env.DARAJA_TRANSACTION_TYPE?.trim() || 'CustomerPayBillOnline';
}

/**
 * Callback URL. Production Daraja only accepts a public HTTPS endpoint, so a
 * localhost URL fails here with an explanation instead of an opaque Daraja 400.
 */
export function getCallbackUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  if (!base) {
    throw new DarajaApiError('NEXT_PUBLIC_APP_URL is not set — Daraja needs a public callback URL.', 503);
  }
  if (!isSandbox() && !base.startsWith('https://')) {
    throw new DarajaApiError(
      `NEXT_PUBLIC_APP_URL must be an https:// URL in production (Daraja rejects insecure callbacks). Got: ${base}`,
      503
    );
  }
  return `${base}/api/payments/daraja-callback`;
}

// ---------------------------------------------------------------------------
// Credentials & request helpers
// ---------------------------------------------------------------------------

/**
 * `yyyyMMddHHmmss` in Nairobi time — Daraja matches this exact string against
 * the one used to build the password, so it must be generated once per request
 * and reused for both fields.
 */
export function timestamp(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: NAIROBI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
}

/** base64(Shortcode + Passkey + Timestamp) — Daraja's STK password. */
export function buildStkPassword(shortcode: string, ts: string): string {
  const passkey = process.env.DARAJA_PASSKEY?.trim();
  if (!passkey) {
    throw new DarajaApiError('DARAJA_PASSKEY (Lipa na M-Pesa Online Passkey) is not set.', 503);
  }
  return Buffer.from(`${shortcode}${passkey}${ts}`, 'utf8').toString('base64');
}

/** Daraja caps AccountReference at 12 chars and TransactionDesc at 13. */
export function sanitizeAccountReference(reference: string): string {
  const cleaned = reference.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return (cleaned || 'RENT').slice(0, 12);
}

export function sanitizeTransactionDesc(description: string): string {
  return description.replace(/\s+/g, ' ').trim().slice(0, 13) || 'Rent payment'.slice(0, 13);
}

// ---------------------------------------------------------------------------
// OAuth (token cached per instance; Daraja tokens live ~3599s)
// ---------------------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | undefined;

function basicAuth(key: string, secret: string): string {
  return `Basic ${Buffer.from(`${key}:${secret}`, 'utf8').toString('base64')}`;
}

async function fetchToken(): Promise<string> {
  const key = process.env.DARAJA_CONSUMER_KEY?.trim();
  const secret = process.env.DARAJA_CONSUMER_SECRET?.trim();
  if (!key || !secret) {
    throw new DarajaApiError(
      'Daraja is not configured. Set DARAJA_CONSUMER_KEY and DARAJA_CONSUMER_SECRET (developer.safaricom.co.ke → My Apps).',
      503
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: basicAuth(key, secret), Accept: 'application/json' }, cache: 'no-store' }
    );
  } catch (error) {
    throw new DarajaApiError(
      `Could not reach Daraja: ${error instanceof Error ? error.message : String(error)}`,
      0
    );
  }

  const body = await res.json().catch(() => null);
  const token = body?.access_token;
  if (!res.ok || !token) {
    throw new DarajaApiError(
      body?.error_description || body?.errorMessage || `Daraja authentication failed (HTTP ${res.status})`,
      res.status === 401 ? 401 : res.status || 502,
      body
    );
  }

  const expiresIn = Number(body.expires_in ?? 3599);
  cachedToken = { value: token, expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000 };
  return token;
}

/** Returns a valid token, refreshing when within a minute of expiry. */
async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  return fetchToken();
}

/** Invalidates the cached token so the next call authenticates afresh. */
function invalidateToken(): void {
  cachedToken = undefined;
}

/** Test seam — clears the module-level token cache. */
export function resetTokenCache(): void {
  invalidateToken();
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function request(path: string, payload: unknown, retryAuth = true): Promise<any> {
  const token = await getToken();

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}/${path}`, {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new DarajaApiError(
      `Could not reach Daraja: ${error instanceof Error ? error.message : String(error)}`,
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

  // 401.001.01 Invalid Access Token — refresh once and replay. A token can be
  // revoked mid-flight, and the payment should not fail for it.
  const invalidToken =
    res.status === 401 ||
    (typeof body?.errorCode === 'string' && body.errorCode.startsWith('404.001.03'));
  if (invalidToken && retryAuth) {
    invalidateToken();
    return request(path, payload, false);
  }

  if (!res.ok) {
    throw new DarajaApiError(
      body?.errorMessage || body?.error_description || body?.ResponseDescription || text.slice(0, 300) || `Daraja request failed (HTTP ${res.status})`,
      res.status,
      body
    );
  }

  // Daraja reports business failures in an HTTP 200 envelope.
  if (body && body.ResponseCode !== undefined && String(body.ResponseCode) !== '0') {
    throw new DarajaApiError(
      body.ResponseDescription || body.errorMessage || 'Daraja rejected the request',
      400,
      body
    );
  }

  return body;
}

// ---------------------------------------------------------------------------
// STK push
// ---------------------------------------------------------------------------

export interface StkPushResult {
  /** Daraja's CheckoutRequestID — used for both the callback and the query. */
  transactionId: string;
  merchantRequestId?: string;
  status: string;
}

/**
 * Fires an M-Pesa STK prompt at `phoneNumber`. The prompt goes to exactly that
 * number; if Daraja refuses the request the caller gets an error rather than a
 * fabricated success.
 */
export async function stkPush(
  phoneNumber: string,
  amount: number,
  accountReference: string,
  transactionDesc = 'Rent payment'
): Promise<StkPushResult> {
  const shortcode = getShortcode();
  if (!shortcode) {
    throw new DarajaApiError('DARAJA_SHORTCODE is not set (the paybill/till number).', 503);
  }
  const callbackUrl = getCallbackUrl();

  const phone = formatPhone(phoneNumber);
  const ts = timestamp();
  const rounded = Math.round(amount);
  if (!Number.isFinite(rounded) || rounded < 1) {
    throw new DarajaApiError('Amount must be at least KES 1', 400);
  }

  const body = await request('mpesa/stkpush/v1/processrequest', {
    BusinessShortCode: shortcode,
    Password: buildStkPassword(shortcode, ts),
    Timestamp: ts,
    TransactionType: getTransactionType(),
    Amount: rounded,
    PartyA: phone,
    PartyB: getPartyB(),
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: sanitizeAccountReference(accountReference),
    TransactionDesc: sanitizeTransactionDesc(transactionDesc),
  });

  const checkoutRequestId = body?.CheckoutRequestID;
  if (!checkoutRequestId) {
    throw new DarajaApiError('Daraja did not return a CheckoutRequestID', 502, body);
  }

  return {
    transactionId: String(checkoutRequestId),
    merchantRequestId: body?.MerchantRequestID ? String(body.MerchantRequestID) : undefined,
    status: 'PENDING',
  };
}

// ---------------------------------------------------------------------------
// Status query (callback fallback)
// ---------------------------------------------------------------------------

export interface DarajaTransactionStatus {
  status: 'QUEUED' | 'SUCCESS' | 'FAILED';
  checkoutRequestId?: string;
  merchantRequestId?: string;
  /** M-Pesa receipt — only the callback carries one for certain. */
  receipt?: string;
  resultDesc?: string;
}

/**
 * Daraja ResultCodes that mean "still waiting", not "failed". Acting on these
 * would fail a payment the customer is still approving.
 */
const STILL_PROCESSING = new Set(['1001', '1037']);

/** Asks Daraja for the STK outcome — the fallback when the callback cannot land. */
export async function queryStatus(checkoutRequestId: string): Promise<DarajaTransactionStatus> {
  const shortcode = getShortcode();
  if (!shortcode) {
    throw new DarajaApiError('DARAJA_SHORTCODE is not set (the paybill/till number).', 503);
  }

  const ts = timestamp();
  let body: any;
  try {
    body = await request('mpesa/stkpushquery/v1/query', {
      BusinessShortCode: shortcode,
      Password: buildStkPassword(shortcode, ts),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    });
  } catch (error) {
    // Daraja reports "still processing" as an HTTP 200 error envelope, but a
    // genuine outage must not be mistaken for a payment outcome.
    if (error instanceof DarajaApiError && error.httpStatus === 400) {
      const details = error.details as any;
      if (details?.errorCode === '500.001.1101' || /being processed/i.test(error.message)) {
        return { status: 'QUEUED', checkoutRequestId };
      }
    }
    throw error;
  }

  const resultDesc = body?.ResultDesc || body?.ResponseDescription;
  const rawResultCode =
    body?.ResultCode !== undefined && body?.ResultCode !== null ? String(body.ResultCode) : undefined;

  if (rawResultCode === undefined) {
    // No result yet — either acknowledged-but-queued or an error envelope.
    if (body?.errorCode === '500.001.1101' || /being processed/i.test(String(body?.errorMessage || ''))) {
      return { status: 'QUEUED', checkoutRequestId };
    }
    if (body?.errorCode) throw new DarajaApiError(body.errorMessage || 'Daraja query failed', 400, body);
    return { status: 'QUEUED', checkoutRequestId };
  }

  if (rawResultCode === '0') {
    return {
      status: 'SUCCESS',
      checkoutRequestId: body.CheckoutRequestID || checkoutRequestId,
      merchantRequestId: body.MerchantRequestID || undefined,
      receipt: readMetadata(body, 'MpesaReceiptNumber'),
      resultDesc: resultDesc || 'The service request is processed successfully.',
    };
  }

  if (STILL_PROCESSING.has(rawResultCode)) {
    return { status: 'QUEUED', checkoutRequestId, resultDesc };
  }

  return {
    status: 'FAILED',
    checkoutRequestId: body.CheckoutRequestID || checkoutRequestId,
    merchantRequestId: body.MerchantRequestID || undefined,
    resultDesc: resultDesc || `M-Pesa returned result code ${rawResultCode}`,
  };
}

// ---------------------------------------------------------------------------
// Callback
// ---------------------------------------------------------------------------

export interface ParsedDarajaCallback {
  checkoutRequestId?: string;
  merchantRequestId?: string;
  resultCode?: number;
  resultDesc?: string;
  amount?: number;
  mpesaReceipt?: string;
  phoneNumber?: string;
  succeeded: boolean;
  failed: boolean;
}

/** Reads a named value out of `CallbackMetadata.Item`. */
function readMetadata(body: any, name: string): string | undefined {
  const items: any[] = body?.CallbackMetadata?.Item ?? body?.stkCallback?.CallbackMetadata?.Item ?? [];
  const hit = items.find((i) => i?.Name === name);
  return hit?.Value !== undefined && hit?.Value !== null ? String(hit.Value) : undefined;
}

/**
 * Shapes Safaricom's callback into the fields the shared finalisation path needs:
 *
 *   { Body: { stkCallback: { MerchantRequestID, CheckoutRequestID, ResultCode,
 *     ResultDesc, CallbackMetadata: { Item: [...] } } } }
 *
 * `ResultCode === 0` is the only success signal; every other code is a failure.
 * Throws when the body is not an STK callback at all.
 */
export function parseCallback(raw: string): ParsedDarajaCallback {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON');
  }

  const stk = parsed?.Body?.stkCallback ?? parsed?.stkCallback ?? parsed;
  if (!stk || typeof stk !== 'object') throw new Error('Invalid payload');
  if (stk.CheckoutRequestID === undefined && stk.ResultCode === undefined) {
    throw new Error('Invalid payload');
  }

  const resultCode =
    stk.ResultCode !== undefined && stk.ResultCode !== null && stk.ResultCode !== ''
      ? Number(stk.ResultCode)
      : undefined;

  const amountRaw = readMetadata(stk, 'Amount');
  const amount = amountRaw !== undefined ? Number(amountRaw) : undefined;

  return {
    checkoutRequestId: stk.CheckoutRequestID ? String(stk.CheckoutRequestID) : undefined,
    merchantRequestId: stk.MerchantRequestID ? String(stk.MerchantRequestID) : undefined,
    resultCode,
    resultDesc: stk.ResultDesc ? String(stk.ResultDesc) : undefined,
    amount: amount !== undefined && Number.isFinite(amount) ? amount : undefined,
    mpesaReceipt: readMetadata(stk, 'MpesaReceiptNumber'),
    phoneNumber: readMetadata(stk, 'PhoneNumber'),
    succeeded: resultCode === 0,
    failed: resultCode !== undefined && !Number.isNaN(resultCode) && resultCode !== 0,
  };
}

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------

/** Daraja wants the bare 2547XXXXXXXX form for PartyA/PhoneNumber. */
export function formatPhone(phone: string): string {
  const digits = phone.trim().replace(/\D/g, '');
  if (!digits) throw new DarajaApiError('Phone number is required', 400);
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  return `254${digits}`;
}
