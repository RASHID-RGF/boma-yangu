import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPhoneNumber, isValidSafaricomPhoneNumber } from '@/lib/payments/palpluss';

test('formatPhoneNumber accepts tenant phone numbers in common Kenyan formats', () => {
  assert.equal(formatPhoneNumber('0712345678'), '254712345678');
  assert.equal(formatPhoneNumber('+254 712 345678'), '254712345678');
  assert.equal(formatPhoneNumber('254712345678'), '254712345678');
  assert.equal(formatPhoneNumber('0712-345-678'), '254712345678');
});

test('isValidSafaricomPhoneNumber accepts real Safaricom numbers and rejects stale or invalid ones', () => {
  assert.equal(isValidSafaricomPhoneNumber('0703406929'), true);
  assert.equal(isValidSafaricomPhoneNumber('0712345678'), true);
  assert.equal(isValidSafaricomPhoneNumber('+254712345678'), true);
  assert.equal(isValidSafaricomPhoneNumber('254712345678'), true);
  assert.equal(isValidSafaricomPhoneNumber('0201234567'), false);
  assert.equal(isValidSafaricomPhoneNumber('9999999999'), false);
  assert.equal(isValidSafaricomPhoneNumber(''), false);
  assert.equal(isValidSafaricomPhoneNumber(null), false);
});
