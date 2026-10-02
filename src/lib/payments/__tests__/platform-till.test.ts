import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM_TILL_NUMBER, PLATFORM_PAYMENT_MODE } from '@/lib/payments/platform';
import {
  formatPaymentInstructions,
  hasPaymentDetails,
} from '@/lib/utils/payment-details';

test('the platform payment destination is fixed: TILL 9062851', () => {
  assert.equal(PLATFORM_TILL_NUMBER, '9062851');
  assert.equal(PLATFORM_PAYMENT_MODE, 'TILL');
});

test('tenant-facing payment instructions always show the platform till', () => {
  assert.deepEqual(formatPaymentInstructions(null), ['Till Number: 9062851']);
  assert.deepEqual(formatPaymentInstructions(undefined), ['Till Number: 9062851']);
});

test('landlord-supplied paybill/till/phone details are ignored', () => {
  assert.deepEqual(
    formatPaymentInstructions({
      mpesaPaybill: '999999',
      mpesaAccountName: 'Some Landlord',
      mpesaTillNumber: '111111',
      mpesaPhone: '0700000000',
    }),
    ['Till Number: 9062851']
  );
});

test('payment details always exist — the platform till is the destination', () => {
  assert.equal(hasPaymentDetails(null), true);
  assert.equal(hasPaymentDetails({}), true);
  assert.equal(hasPaymentDetails({ mpesaPaybill: '999999' }), true);
});
