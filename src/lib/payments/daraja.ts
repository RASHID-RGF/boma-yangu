const DEFAULT_CALLBACK_URL = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/payments/daraja-callback`;

interface DarajaTokenResponse {
  access_token: string;
  expires_in: number;
}

interface DarajaStkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

let accessTokenCache: { token: string; expiresAt: number } | null = null;

function getBaseUrl(): string {
  return process.env.MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

function getConfig() {
  return {
    consumerKey: process.env.MPESA_CONSUMER_KEY || '',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
    shortCode: process.env.MPESA_SHORTCODE || '',
    passKey: process.env.MPESA_PASSKEY || '',
    callbackUrl: process.env.MPESA_CALLBACK_URL || DEFAULT_CALLBACK_URL,
  };
}

export function isDarajaConfigured(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.consumerKey && cfg.consumerSecret && cfg.shortCode && cfg.passKey);
}

function normalizePhoneNumber(phone: string): string {
  return phone.replace(/^0+/, '254').replace(/\+/, '').replace(/\s+/g, '');
}

function getTimestamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function buildPassword(timestamp: string): string {
  const cfg = getConfig();
  return Buffer.from(`${cfg.shortCode}${cfg.passKey}${timestamp}`, 'utf8').toString('base64');
}

async function getAccessToken(): Promise<string> {
  const cfg = getConfig();
  if (!cfg.consumerKey || !cfg.consumerSecret) {
    throw new Error('Daraja credentials are not configured.');
  }

  const now = Date.now();
  if (accessTokenCache && accessTokenCache.expiresAt > now) {
    return accessTokenCache.token;
  }

  const authHeader = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString('base64');
  const res = await fetch(`${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Daraja access token: ${res.status} ${text}`);
  }

  const payload = (await res.json()) as DarajaTokenResponse;
  if (!payload.access_token) {
    throw new Error('Daraja token response did not include an access token.');
  }

  accessTokenCache = {
    token: payload.access_token,
    expiresAt: now + Math.max(30, (payload.expires_in || 3600) * 1000) - 10_000,
  };

  return accessTokenCache.token;
}

export interface StkPushResult {
  transactionId: string;
  status: string;
  responseCode?: string;
  customerMessage?: string;
}

export async function stkPush(
  phoneNumber: string,
  amount: number,
  accountReference: string,
  transactionDesc: string
): Promise<StkPushResult> {
  const cfg = getConfig();
  const timestamp = getTimestamp();
  const password = buildPassword(timestamp);
  const token = await getAccessToken();
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  const res = await fetch(`${getBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: Number(normalizedPhone),
      PartyB: Number(cfg.shortCode),
      PhoneNumber: Number(normalizedPhone),
      CallBackURL: cfg.callbackUrl,
      AccountReference: accountReference || 'RENT',
      TransactionDesc: transactionDesc || 'Rent payment',
    }),
  });

  const payload = (await res.json()) as DarajaStkPushResponse & { errorMessage?: string };

  if (!res.ok || payload.ResponseCode !== '0') {
    const message = payload.errorMessage || payload.ResponseDescription || 'Daraja STK push failed';
    throw new Error(message);
  }

  return {
    transactionId: payload.CheckoutRequestID,
    status: payload.CustomerMessage || 'PENDING',
    responseCode: payload.ResponseCode,
    customerMessage: payload.CustomerMessage,
  };
}

export async function queryStatus(checkoutRequestId: string) {
  const cfg = getConfig();
  const timestamp = getTimestamp();
  const password = buildPassword(timestamp);
  const token = await getAccessToken();

  const res = await fetch(`${getBaseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Daraja status query failed: ${res.status} ${text}`);
  }

  return res.json();
}
