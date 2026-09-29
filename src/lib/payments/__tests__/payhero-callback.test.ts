import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCallback,
  packPayheroIds,
  unpackPayheroIds,
  formatPhoneForPayhero,
  resolveChannelId,
} from '@/lib/payments/payhero';

// The exact payload documented at
// https://docs.payhero.co.ke/docs/payment-callback
const SUCCESS_CALLBACK = JSON.stringify({
  forward_url: '',
  response: {
    Amount: 10,
    CheckoutRequestID: 'ws_CO_14012024103543427709099876',
    ExternalReference: 'INV-009',
    MerchantRequestID: '3202-70921557-1',
    MpesaReceiptNumber: 'SAE3YULR0Y',
    Phone: '+254709099876',
    ResultCode: 0,
    ResultDesc: 'The service request is processed successfully.',
    Status: 'Success',
  },
  status: true,
});

test('parseCallback reads the documented success payload', () => {
  const cb = parseCallback(SUCCESS_CALLBACK);
  assert.equal(cb.succeeded, true);
  assert.equal(cb.failed, false);
  assert.equal(cb.checkoutRequestId, 'ws_CO_14012024103543427709099876');
  assert.equal(cb.externalReference, 'INV-009');
  assert.equal(cb.mpesaReceipt, 'SAE3YULR0Y');
  assert.equal(cb.phone, '+254709099876');
  assert.equal(cb.amount, 10);
  assert.equal(cb.resultCode, 0);
});

test('parseCallback accepts a bare response object', () => {
  const cb = parseCallback(
    JSON.stringify({
      Amount: 1500,
      CheckoutRequestID: 'ws_CO_1',
      ExternalReference: 'INV-010',
      MpesaReceiptNumber: 'ABC123XYZ',
      Phone: '254712345678',
      ResultCode: 0,
      Status: 'Success',
    })
  );
  assert.equal(cb.succeeded, true);
  assert.equal(cb.mpesaReceipt, 'ABC123XYZ');
});

test('parseCallback treats a non-zero ResultCode as failure', () => {
  const cb = parseCallback(
    JSON.stringify({
      response: {
        Amount: 100,
        CheckoutRequestID: 'ws_CO_2',
        ExternalReference: 'INV-011',
        ResultCode: 1032,
        ResultDesc: 'Request cancelled by user',
        Status: 'Failed',
      },
    })
  );
  assert.equal(cb.failed, true);
  assert.equal(cb.succeeded, false);
  assert.equal(cb.resultCode, 1032);
});

test('parseCallback keeps an unknown outcome pending rather than failing it', () => {
  // No ResultCode and no recognisable Status — the status poll still has a
  // chance to resolve this, so it must be neither success nor failure.
  const cb = parseCallback(
    JSON.stringify({ response: { CheckoutRequestID: 'ws_CO_3', ExternalReference: 'INV-012' } })
  );
  assert.equal(cb.succeeded, false);
  assert.equal(cb.failed, false);
});

test('parseCallback lets ResultCode override a contradictory Status string', () => {
  const paid = parseCallback(
    JSON.stringify({ response: { CheckoutRequestID: 'ws_CO_4', ResultCode: 0, Status: 'Failed' } })
  );
  assert.equal(paid.succeeded, true);

  const unpaid = parseCallback(
    JSON.stringify({ response: { CheckoutRequestID: 'ws_CO_5', ResultCode: 1, Status: 'Success' } })
  );
  assert.equal(unpaid.failed, true);
});

test('parseCallback rejects bodies that are not payment callbacks', () => {
  assert.throws(() => parseCallback('not json'));
  assert.throws(() => parseCallback(JSON.stringify({ hello: 'world' })));
  assert.throws(() => parseCallback(JSON.stringify({ response: {} })));
});

test('packPayheroIds round-trips both provider ids and marks the owning provider', () => {
  const packed = packPayheroIds('E8UWT7CLUW', 'ws_CO_15012024164321519708344109');
  assert.deepEqual(unpackPayheroIds(packed), {
    reference: 'E8UWT7CLUW',
    checkoutRequestId: 'ws_CO_15012024164321519708344109',
  });

  // Missing CheckoutRequestID still packs with the separator so the value is
  // still recognisable as Payhero-owned.
  const partial = packPayheroIds('E8UWT7CLUW', null);
  assert.equal(partial.includes('|'), true);
  assert.deepEqual(unpackPayheroIds(partial), { reference: 'E8UWT7CLUW', checkoutRequestId: '' });

  // PalPluss ids never contain the separator — they must NOT look like Payhero.
  assert.equal(unpackPayheroIds('0f0d0d0a-1111-2222-3333-444455556666'), null);
  assert.equal(unpackPayheroIds(null), null);
  assert.equal(unpackPayheroIds(''), null);
});

test('formatPhoneForPayhero converts every common format to the documented local form', () => {
  assert.equal(formatPhoneForPayhero('0787677676'), '0787677676');
  assert.equal(formatPhoneForPayhero('254787677676'), '0787677676');
  assert.equal(formatPhoneForPayhero('+254 787 677 676'), '0787677676');
  assert.throws(() => formatPhoneForPayhero('   '));
});

test('resolveChannelId ignores non-numeric legacy channel ids and falls back to the platform default', () => {
  const previous = process.env.PAYHERO_CHANNEL_ID;
  process.env.PAYHERO_CHANNEL_ID = '133';
  try {
    // A PalPluss channel UUID must never be handed to Payhero as a channel id.
    assert.equal(resolveChannelId('0024e5bd-1111-2222-3333-444455556666'), 133);
    assert.equal(resolveChannelId(''), 133);
    assert.equal(resolveChannelId(null), 133);
    // A numeric per-property channel wins over the default.
    assert.equal(resolveChannelId('26703032'), 26703032);
  } finally {
    if (previous === undefined) delete process.env.PAYHERO_CHANNEL_ID;
    else process.env.PAYHERO_CHANNEL_ID = previous;
  }
});
