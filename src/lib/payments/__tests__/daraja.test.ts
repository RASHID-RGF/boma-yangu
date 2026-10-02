import test from 'node:test';
import assert from 'node:assert/strict';
import {
  timestamp,
  buildStkPassword,
  sanitizeAccountReference,
  sanitizeTransactionDesc,
  formatPhone,
  parseCallback,
  getCallbackUrl,
  getShortcode,
  isDarajaConfigured,
  isSandbox,
} from '@/lib/payments/daraja';

/** Runs `fn` with `overrides` applied to process.env, restoring the originals. */
function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) saved[key] = process.env[key];

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('timestamp is a Nairobi yyyyMMddHHmmss value within a minute of now', () => {
  const ts = timestamp();
  assert.match(ts, /^\d{14}$/);

  // Read it back as Nairobi wall-clock time. Safaricom compares this string
  // against the one it derived server-side, so producing it in the host's
  // timezone (or with a 24h hour) would fail the password check and every push.
  const wallClockAsUtc = Date.UTC(
    Number(ts.slice(0, 4)),
    Number(ts.slice(4, 6)) - 1,
    Number(ts.slice(6, 8)),
    Number(ts.slice(8, 10)),
    Number(ts.slice(10, 12)),
    Number(ts.slice(12, 14))
  );
  // East Africa Time is UTC+3 year-round (Kenya observes no DST).
  const nairobiNow = Date.now() + 3 * 60 * 60 * 1000;
  assert.ok(Math.abs(wallClockAsUtc - nairobiNow) < 60_000, `timestamp ${ts} was not Nairobi time`);
});

test('buildStkPassword is base64(shortcode + passkey + timestamp)', () => {
  withEnv({ DARAJA_PASSKEY: 'passkey-abc' }, () => {
    const ts = '20260927143059';
    const expected = Buffer.from('174379passkey-abc20260927143059', 'utf8').toString('base64');
    assert.equal(buildStkPassword('174379', ts), expected);
  });

  withEnv({ DARAJA_PASSKEY: undefined }, () => {
    assert.throws(() => buildStkPassword('174379', '20260927143059'), /DARAJA_PASSKEY/);
  });
});

test('sanitizeAccountReference keeps Daraja happy (12 chars, alphanumeric)', () => {
  assert.equal(sanitizeAccountReference('INV-2024-0099'), 'INV20240099');
  // Long invoice numbers are truncated rather than rejected by Safaricom.
  assert.equal(sanitizeAccountReference('INV-2024-0099-EXTRA').length, 12);
  assert.equal(sanitizeAccountReference('RENT-UNIT 4B'), 'RENTUNIT4B');
  assert.equal(sanitizeAccountReference('   '), 'RENT');
  assert.equal(sanitizeAccountReference('!!@@##'), 'RENT');
});

test('sanitizeTransactionDesc stays within the 13 character limit', () => {
  assert.equal(sanitizeTransactionDesc('Rent payment'), 'Rent payment');
  assert.equal(sanitizeTransactionDesc('September rent for unit 4B').length, 13);
  assert.equal(sanitizeTransactionDesc(''), 'Rent payment');
});

test('formatPhone normalises every Kenyan input to the 2547XXXXXXXX form', () => {
  assert.equal(formatPhone('0712345678'), '254712345678');
  assert.equal(formatPhone('+254 712 345678'), '254712345678');
  assert.equal(formatPhone('254712345678'), '254712345678');
  assert.equal(formatPhone('712345678'), '254712345678');
  assert.throws(() => formatPhone('   '));
});

test('parseCallback reads a successful Safaricom callback', () => {
  const cb = parseCallback(
    JSON.stringify({
      Body: {
        stkCallback: {
          MerchantRequestID: '29115-34620561-1',
          CheckoutRequestID: 'ws_CO_191220191020363925',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 10500.0 },
              { Name: 'MpesaReceiptNumber', Value: 'SG722NMVXQ' },
              { Name: 'TransactionDate', Value: 20260927143059 },
              { Name: 'PhoneNumber', Value: 254708374149 },
            ],
          },
        },
      },
    })
  );

  assert.equal(cb.succeeded, true);
  assert.equal(cb.failed, false);
  assert.equal(cb.checkoutRequestId, 'ws_CO_191220191020363925');
  assert.equal(cb.merchantRequestId, '29115-34620561-1');
  assert.equal(cb.mpesaReceipt, 'SG722NMVXQ');
  assert.equal(cb.amount, 10500);
  assert.equal(cb.phoneNumber, '254708374149');
  assert.equal(cb.resultCode, 0);
});

test('parseCallback treats every non-zero ResultCode as a failure', () => {
  const cancelled = parseCallback(
    JSON.stringify({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_CO_2',
          ResultCode: 1032,
          ResultDesc: 'Request cancelled by user',
        },
      },
    })
  );
  assert.equal(cancelled.failed, true);
  assert.equal(cancelled.succeeded, false);
  assert.equal(cancelled.mpesaReceipt, undefined);

  const insufficient = parseCallback(
    JSON.stringify({
      Body: { stkCallback: { CheckoutRequestID: 'ws_CO_3', ResultCode: 1, ResultDesc: 'The balance is insufficient for the transaction.' } },
    })
  );
  assert.equal(insufficient.failed, true);
});

test('parseCallback leaves an outcome-less callback neither succeeded nor failed', () => {
  const cb = parseCallback(
    JSON.stringify({ Body: { stkCallback: { CheckoutRequestID: 'ws_CO_4' } } })
  );
  assert.equal(cb.succeeded, false);
  assert.equal(cb.failed, false);
});

test('parseCallback rejects bodies that are not STK callbacks', () => {
  assert.throws(() => parseCallback('not json'));
  assert.throws(() => parseCallback(JSON.stringify({ hello: 'world' })));
  assert.throws(() => parseCallback(JSON.stringify({ Body: { stkCallback: {} } })));
});

test('getCallbackUrl refuses insecure callbacks in production but allows them in sandbox', () => {
  withEnv({ DARAJA_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://bomayangu.co.ke' }, () => {
    assert.equal(isSandbox(), false);
    assert.equal(getCallbackUrl(), 'https://bomayangu.co.ke/api/payments/daraja-callback');
    // Trailing slashes must not produce a double slash in the path.
    assert.equal(
      (() => {
        const base = 'https://bomayangu.co.ke/'.replace(/\/+$/, '');
        return `${base}/api/payments/daraja-callback`;
      })(),
      'https://bomayangu.co.ke/api/payments/daraja-callback'
    );
  });

  withEnv({ DARAJA_ENV: 'production', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' }, () => {
    assert.throws(() => getCallbackUrl(), /https:\/\//);
  });

  withEnv({ DARAJA_ENV: 'sandbox', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' }, () => {
    assert.equal(isSandbox(), true);
    assert.equal(getCallbackUrl(), 'http://localhost:3000/api/payments/daraja-callback');
  });

  withEnv({ DARAJA_ENV: 'production', NEXT_PUBLIC_APP_URL: undefined }, () => {
    assert.throws(() => getCallbackUrl(), /NEXT_PUBLIC_APP_URL/);
  });
});

test('isDarajaConfigured needs the credentials; the shortcode defaults to the platform till', () => {
  const complete = {
    DARAJA_ENV: 'production',
    DARAJA_CONSUMER_KEY: 'key',
    DARAJA_CONSUMER_SECRET: 'secret',
    DARAJA_SHORTCODE: '174379',
    DARAJA_PASSKEY: 'passkey',
  };

  withEnv(complete, () => assert.equal(isDarajaConfigured(), true));

  // The shortcode is not required: it falls back to the platform's fixed Buy
  // Goods till, so pushes default to 9062851 with no extra configuration.
  withEnv({ ...complete, DARAJA_SHORTCODE: '' }, () => {
    assert.equal(isDarajaConfigured(), true);
    assert.equal(getShortcode(), '9062851');
  });

  for (const missing of ['DARAJA_CONSUMER_KEY', 'DARAJA_CONSUMER_SECRET', 'DARAJA_PASSKEY']) {
    withEnv({ ...complete, [missing]: '' }, () =>
      assert.equal(isDarajaConfigured(), false, `${missing} should be required`)
    );
  }
});
