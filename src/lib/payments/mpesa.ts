const MPESA_ENVIRONMENT = process.env.MPESA_ENVIRONMENT || 'sandbox';
const BASE_URL = MPESA_ENVIRONMENT === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

interface MpesaAuthResponse {
  access_token: string;
  expires_in: string;
}

interface MpesaStkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

let accessToken: string | null = null;
let tokenExpiry: number = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const response = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  const data: MpesaAuthResponse = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + parseInt(data.expires_in) * 1000;
  
  return accessToken!;
}

function getTimestamp(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function getPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

export async function stkPush(
  phoneNumber: string,
  amount: number,
  accountReference: string,
  transactionDesc: string
): Promise<MpesaStkPushResponse> {
  const token = await getAccessToken();
  const timestamp = getTimestamp();
  const shortcode = process.env.MPESA_SHORTCODE!;
  const passkey = process.env.MPESA_PASSKEY!;
  const password = getPassword(shortcode, passkey, timestamp);

  // Format phone: remove leading 0 or +254, ensure 254XXXXXXXXX format
  const formattedPhone = phoneNumber.replace(/^0+/, '254').replace(/^\+/, '');
  
  const response = await fetch(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(amount),
        PartyA: formattedPhone,
        PartyB: shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/mpesa-callback`,
        AccountReference: accountReference,
        TransactionDesc: transactionDesc,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`M-Pesa API error: ${response.statusText}`);
  }

  return response.json();
}

export async function queryStatus(checkoutRequestId: string): Promise<{
  ResultCode: string;
  ResultDesc: string;
  Amount?: number;
  MpesaReceiptNumber?: string;
  TransactionDate?: string;
  PhoneNumber?: string;
}> {
  const token = await getAccessToken();
  const timestamp = getTimestamp();
  const shortcode = process.env.MPESA_SHORTCODE!;
  const passkey = process.env.MPESA_PASSKEY!;
  const password = getPassword(shortcode, passkey, timestamp);

  const response = await fetch(
    `${BASE_URL}/mpesa/stkpushquery/v1/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    }
  );

  return response.json();
}

export async function b2cPayment(
  phoneNumber: string,
  amount: number,
  remarks: string
): Promise<unknown> {
  const token = await getAccessToken();
  const timestamp = getTimestamp();
  const shortcode = process.env.MPESA_SHORTCODE!;
  const passkey = process.env.MPESA_PASSKEY!;
  const password = getPassword(shortcode, passkey, timestamp);
  const formattedPhone = phoneNumber.replace(/^0+/, '254').replace(/^\+/, '');

  const response = await fetch(
    `${BASE_URL}/mpesa/b2c/v1/paymentrequest`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        InitiatorName: 'testapi',
        SecurityCredential: password,
        CommandID: 'BusinessPayment',
        Amount: Math.round(amount),
        PartyA: shortcode,
        PartyB: formattedPhone,
        Remarks: remarks,
        QueueTimeOutURL: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/b2c-timeout`,
        ResultURL: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/b2c-result`,
        Occasion: '',
      }),
    }
  );

  return response.json();
}
